#!/usr/bin/env python3
"""Quick test of memory_matrix core without starting server."""
import sys
sys.path.insert(0, 'C:/Users/Admin/Desktop/PURPCLAW')

# Suppress TF/Keras warnings
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TRANSFORMERS_VERBOSITY'] = 'error'

print("Step 1: Testing basic imports...")
import time

# Test MemoryMatrix import directly
print("Step 2: Importing MemoryMatrix...")
try:
    from memory_matrix import MemoryMatrix
    print("  MemoryMatrix imported OK")
except Exception as e:
    print(f"  Import failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("Step 3: Creating MemoryMatrix instance...")
try:
    start = time.time()
    mm = MemoryMatrix()
    elapsed = time.time() - start
    print(f"  Created in {elapsed:.2f}s")
    print(f"  Working memory: {len(mm.working.slots)} slots")
    print(f"  Long term: {len(mm.long_term.atoms)} atoms")
    print(f"  Shadow: {type(mm.shadow).__name__}")
except Exception as e:
    print(f"  Creation failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("Step 4: Testing ingest...")
try:
    atom_id = mm.ingest("hello world test", content_type='text', source='test')
    print(f"  Ingested: {atom_id}")
    print(f"  Total atoms: {len(mm.long_term.atoms)}")
except Exception as e:
    print(f"  Ingest failed: {e}")
    import traceback
    traceback.print_exc()

print("\nAll tests completed!")
sys.exit(0)