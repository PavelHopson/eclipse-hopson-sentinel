"""Test fixture: idle child with no model, microphone, network or writes."""
import json
import os
import sys
import time
print(json.dumps({'probePid': os.getpid()}), file=sys.stderr, flush=True)
time.sleep(60)
