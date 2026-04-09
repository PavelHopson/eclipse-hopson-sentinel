# Sentinel + Ollama: Локальные AI-модели

## Рекомендуемая модель

### Huihui-Qwen 3.5 35B (abliterated) — основная
```bash
ollama run huihui-ai/Huihui-Qwen3.5-35B-A3B-abliterated
```

| Параметр | Значение |
|----------|----------|
| Размер | 35B параметров (MoE, 3B активных) |
| RAM | ~8-12 GB (MoE — лёгкая для своего размера) |
| GPU | опционально, работает на CPU |
| Цензура | **нет** — abliterated, без отказов |
| Приватность | 100% локально, офлайн |
| Базовая модель | Qwen 3.5 |
| Источник | [HuggingFace](https://huggingface.co/huihui-ai/Huihui-Qwen3.5-35B-A3B-abliterated) |

**Почему именно эта:**
- MoE-архитектура — только 3B параметров активны одновременно, поэтому 35B модель работает как 7B по скорости
- Abliterated — удалены все ограничения, модель не отказывает в задачах
- Qwen 3.5 база — одна из лучших open-source моделей для кодинга и русского языка
- Полностью приватно — данные не покидают вашу машину

### Для быстрых задач
```bash
ollama run qwen2.5-coder:7b
```
- Лёгкая модель для автодополнения и быстрых правок
- RAM: ~5GB
- Идеально как `SMALL_MODEL` в SmartRouter

### Для анализа кода
```bash
ollama run deepseek-coder-v2:16b
```
- Сильная модель для code review и архитектурных решений
- RAM: ~12GB

## Облачная альтернатива: Qwen 3.6 (бесплатно)

Если нужна мощная модель без локальной установки:

```bash
# Через OpenRouter (бесплатный API)
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-v1-ваш-ключ
OPENAI_MODEL=qwen/qwen3.6-plus-preview:free
```

| Параметр | Значение |
|----------|----------|
| Контекст | **1 000 000 токенов** |
| Стоимость | бесплатно (free tier) |
| Рассуждение | улучшенное (chain-of-thought) |
| Кодинг | на уровне GPT-4o |
| Ключ | [openrouter.ai/keys](https://openrouter.ai/workspaces/default/keys) |

## Настройка Sentinel

### Вариант 1: Локально (Ollama)
```bash
# 1. Установите Ollama
# https://ollama.com/download

# 2. Скачайте модель
ollama run huihui-ai/Huihui-Qwen3.5-35B-A3B-abliterated

# 3. В .env:
CLAUDE_CODE_USE_OPENAI=1
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=huihui-ai/Huihui-Qwen3.5-35B-A3B-abliterated
```

### Вариант 2: Облако (OpenRouter + Qwen 3.6)
```bash
# 1. Получите ключ: https://openrouter.ai/workspaces/default/keys

# 2. В .env:
CLAUDE_CODE_USE_OPENAI=1
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-v1-ваш-ключ
OPENAI_MODEL=qwen/qwen3.6-plus-preview:free
```

### Вариант 3: SmartRouter (авто-балансировка)
```bash
# В .env:
ROUTER_MODE=smart
ROUTER_STRATEGY=balanced
OPENROUTER_API_KEY=sk-or-v1-ваш-ключ
# SmartRouter автоматически выберет лучший провайдер
# Ollama (локальный, бесплатный) → OpenRouter (облако, бесплатный) → OpenAI (платный)
```

## Преимущества локальных моделей

- **Приватность** — код не покидает вашу машину
- **Без rate limits** — генерируйте сколько нужно
- **Без цензуры** — модель не отказывает в задачах
- **Без интернета** — работает полностью офлайн
- **Бесплатно** — никаких API-ключей и подписок
