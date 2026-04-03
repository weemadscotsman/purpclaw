import edge_tts, asyncio, ctypes, os, time

mciSendString = ctypes.windll.winmm.mciSendStringW
mciSendString.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_int, ctypes.c_int]
mciSendString.restype = ctypes.c_uint

AUDIO_DIR = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW'

def mci_check_error(code):
    if code == 0:
        return 'OK'
    err_buf = ctypes.create_string_buffer(128)
    mciSendString('errorcode all', err_buf, 128, None)
    return f'code={code}'

def force_close(alias):
    mciSendString(f'close {alias}', None, 0, 0)

def mci_play_nowait(path, alias):
    """Play a file NON-BLOCKING, return immediately."""
    abs_path = os.path.abspath(path)
    force_close(alias)
    r1 = mciSendString(f'open "{abs_path}" type mpegvideo alias {alias}', None, 0, 0)
    if r1 != 0:
        return mci_check_error(r1)
    mciSendString(f'play {alias}', None, 0, 0)
    return 'OK'

def mci_play_blocking(path, alias):
    """Play a file BLOCKING, wait for it to finish."""
    abs_path = os.path.abspath(path)
    force_close(alias)
    r1 = mciSendString(f'open "{abs_path}" type mpegvideo alias {alias}', None, 0, 0)
    if r1 != 0:
        return mci_check_error(r1)
    r2 = mciSendString(f'play {alias} wait', None, 0, 0)
    r3 = mciSendString(f'close {alias}', None, 0, 0)
    return 'OK' if r2 == 0 and r3 == 0 else f'play={mci_check_error(r2)} close={mci_check_error(r3)}'

async def gen_quick(text, path):
    await edge_tts.Communicate(text, 'en-US-JennyNeural').save(path)
    return os.path.exists(path) and os.path.getsize(path) > 5000

async def main():
    os.chdir(AUDIO_DIR)
    results = {}
    
    # ===== DIAG 1: Rapid generation tests (no playback to test edge_tts stability) =====
    print('=== DIAG 1: Edge TTS generation stability - 5 rapid files ===')
    for i in range(1, 6):
        path = f'quick_{i}.mp3'
        ok = await gen_quick(f'Test phrase number {i}', path)
        sz = os.path.getsize(path) if ok else 0
        print(f'  quick_{i}.mp3: {"OK" if ok else "FAIL"} ({sz//1024}KB)')
        results[f'gen_{i}'] = ok
    
    # ===== DIAG 2: NON-blocking rapid playback test =====
    print()
    print('=== DIAG 2: Rapid non-blocking plays - 5 files overlapping ===')
    for i in range(1, 6):
        path = f'quick_{i}.mp3'
        msg = mci_play_nowait(path, f'qb{i}')
        print(f'  play {i}: {msg}')
        results[f'play_nb_{i}'] = msg == 'OK'
    # let them all play
    time.sleep(3)
    
    # ===== DIAG 3: Block blocking plays one by one (verify no zombie handles) =====
    print()
    print('=== DIAG 3: Sequential blocking plays - clean handle each time ===')
    for i in range(1, 4):
        path = f'quick_{i}.mp3'
        msg = mci_play_blocking(path, f'seq{i}')
        print(f'  seq {i}: {msg}')
        results[f'play_b_{i}'] = msg == 'OK'
    
    # ===== DIAG 4: Play largest existing file =====
    print()
    print('=== DIAG 4: Play largest existing file ===')
    large = 'E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW/verifier_the_whole_story.mp3'
    if os.path.exists(large):
        sz = os.path.getsize(large)
        print(f'  File: {sz//1024}KB')
        msg = mci_play_blocking(large, 'large_test')
        print(f'  Play result: {msg}')
        results['play_large'] = msg == 'OK'
    else:
        print('  FILE MISSING')
        results['play_large'] = False
    
    # ===== DIAG 5: Test wait vs no-wait flag difference =====
    print()
    print('=== DIAG 5: Verify wait flag actually waits ===')
    path = 'quick_1.mp3'
    start = time.time()
    mci_play_blocking(path, 'wait_test')
    dur = time.time() - start
    print(f'  Blocking play took: {dur:.2f}s (expected ~1-3s)')
    results['wait_flag_works'] = 0.5 < dur < 8  # should be > 0.5s for the text
    
    print()
    print('=== SUMMARY ===')
    all_pass = all(v is True or v == 'OK' for v in results.values())
    for k, v in results.items():
        tag = 'PASS' if v is True or v == 'OK' else 'FAIL'
        print(f'  {tag} {k}: {v}')
    print(f'  Overall: {"ALL PASS" if all_pass else "SOME FAIL"}')

asyncio.run(main())
