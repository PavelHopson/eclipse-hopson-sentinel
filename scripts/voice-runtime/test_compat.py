"""Numerical regression for the pinned fork; runs without model weights."""
import unittest
from types import SimpleNamespace
import torch
from qwen_tts.core.compat import default_rope_parameters, restore_nonpersistent_rope_buffers
from qwen_tts.core.models.modeling_qwen3_tts import Qwen3TTSTalkerRotaryEmbedding, Qwen3TTSRotaryEmbedding
from qwen_tts.core.tokenizer_12hz.modeling_qwen3_tts_tokenizer_v2 import Qwen3TTSTokenizerV2DecoderRotatoryEmbedding


class CompatibilityTests(unittest.TestCase):
    def config(self):
        return SimpleNamespace(head_dim=16, hidden_size=32, num_attention_heads=2,
                               rope_theta=1000000.0, max_position_embeddings=2048, rope_scaling=None)

    def test_restores_all_three_nonpersistent_buffer_classes(self):
        for kind in (Qwen3TTSTalkerRotaryEmbedding, Qwen3TTSRotaryEmbedding,
                     Qwen3TTSTokenizerV2DecoderRotatoryEmbedding):
            with self.subTest(kind=kind.__name__):
                module = kind(self.config())
                expected = module.inv_freq.clone()
                # Reproduce the observed 5.x materialization defect deterministically.
                module.inv_freq.zero_()
                self.assertFalse(torch.equal(module.inv_freq, expected))
                self.assertEqual(restore_nonpersistent_rope_buffers(module), 1)
                torch.testing.assert_close(module.inv_freq, expected, rtol=0, atol=0)
                self.assertIs(module.original_inv_freq, module.inv_freq)
                self.assertNotIn('inv_freq', module.state_dict())

    def test_formula_matches_original_default_rope(self):
        freq, scale = default_rope_parameters(self.config(), 'cpu')
        reference = torch.tensor([1000000.0 ** (-i / 16) for i in range(0, 16, 2)])
        torch.testing.assert_close(freq, reference)
        self.assertEqual(scale, 1.0)

    def test_unknown_runtime_is_rejected(self):
        with self.assertRaises(ValueError):
            restore_nonpersistent_rope_buffers(torch.nn.Identity())
        module = Qwen3TTSTalkerRotaryEmbedding(self.config())
        module.rope_type = 'unapproved'
        with self.assertRaises(ValueError):
            restore_nonpersistent_rope_buffers(module)


if __name__ == '__main__':
    unittest.main()
