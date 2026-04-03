import audioop, asyncio, ctypes, os, sys, time

WINMM = ctypes.windll.winmm
mciSendString = WINMM.mciSendStringW
mciSendString.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_int, ctypes.c_int]
mciSendString.restype = ctypes.c_uint

OUT = open('diag_log.txt', 'w', encoding='utf-8')
def log(*a): print(*a, file=OUT, flush=True)

def force_close(alias):
    mciSendString(f'close {alias}', None, 0, 0)

def safe_mci(cmd, alias='x', timeout_ms=None, expect_wait=False):
    """Wrapper that enforces a timeout on play commands."""
    log(f'  -> {cmd[:60]}')
    r = mciSendString(cmd, None, 0, 0)
    log(f'  <- r={r}')
    return r

async def step1():
    """DIAG 1: Quick generation test (no playback)."""
    log('=== DIAG 1: Quick generation (5 files) ===')
    try:
        import edge_tts
        ok = {}
        for i in range(1, 6):
            path = f'diag_q{i}.mp3'
            try:
                await edge_tts.Communicate(f'Test phrase number {i}. Counting up steadily.', 'en-US-JennyNeural').save(path)
                sz = os.path.getsize(path) if os.path.exists(path) else 0
                ok[i] = sz > 2000
                log(f'  gen {i}: {"OK" if ok[i] else "FAIL"} {sz} bytes')
            except Exception as ex:
                log(f'  gen {i}: EXCEPTION {ex}')
                ok[i] = False
        return all(ok[i] for i in ok)
    except Exception as e:
        log(f'DIAG 1 failed to import: {e}')
        return False

def step2():
    """DIAG 2: Non-blocking play test (returns immediately)."""
    log('=== DIAG 2: Non-blocking plays (5 rapid) ===')
    ok = {}
    for i in range(1, 6):
        path = f'diag_q{i}.mp3'
        if not os.path.exists(path):
            log(f'  play {i}: FILE MISSING')
            ok[i] = False
            continue
        force_close(f'd{i}')
        # Non-blocking: no "wait" flag
        r1 = mciSendString(f'open "{os.path.abspath(path)}" type mpegvideo alias d{i}', None, 0, 0)
        log(f'  open {i}: r={r1}')
        if r1 != 0:
            ok[i] = False
            continue
        r2 = mciSendString(f'play d{i}', None, 0, 0)
        log(f'  play {i}: r={r2}')
        ok[i] = (r1 == 0 and r2 == 0)
        time.sleep(0.2)
    time.sleep(3)  # let audio finish
    return all(ok[i] for i in ok)

def step3():
    """DIAG 3: Blocking play test - verify "wait" actually works and doesn't hang."""
    log('=== DIAG 3: Blocking plays (3 sequential, verify they complete) ===')
    ok = {}
    for i in range(1, 4):
        path = f'diag_q{i}.mp3'
        if not os.path.exists(path):
            log(f'  block {i}: FILE MISSING')
            ok[i] = False
            continue
        force_close(f'b{i}')
        start = time.time()
        r1 = mciSendString(f'open "{os.path.abspath(path)}" type mpegvideo alias b{i}', None, 0, 0)
        if r1 != 0:
            log(f'  block {i}: open r={r1}')
            ok[i] = False
            continue
        r2 = mciSendString(f'play b{i} wait', None, 0, 0)
        dur = time.time() - start
        r3 = mciSendString(f'close b{i}', None, 0, 0)
        log(f'  block {i}: open={r1} play={r2} close={r3} dur={dur:.2f}s')
        ok[i] = (r2 == 0 and 0.3 < dur < 10)
        time.sleep(0.3)
    return all(ok[i] for i in ok)

def step4():
    """DIAG 4: Play largest existing file from this session."""
    log('=== DIAG 4: Play largest existing file ===')
    path = 'verifier_the_whole_story.mp3'
    if not os.path.exists(path):
        log('  FILE MISSING')
        return False
    sz = os.path.getsize(path)
    log(f'  Size: {sz} bytes ({sz//1024}KB)')
    force_close('large')
    start = time.time()
    r1 = mciSendString(f'open "{os.path.abspath(path)}" type mpegvideo alias large', None, 0, 0)
    if r1 != 0:
        log(f'  open r={r1}')
        return False
    r2 = mciSendString(f'play large wait', None, 0, 0)
    dur = time.time() - start
    r3 = mciSendString(f'close large', None, 0, 0)
    log(f'  Result: play={r2} dur={dur:.1f}s close={r3}')
    return r2 == 0 and dur > 1

async def main():
    os.chdir('E:/god folder/02_ACTIVE_PROJECTS/PURPCLAW')
    try:
        t1 = await step1()
    except Exception as e:
        log(f'STEP1 EXCEPTION: {e}')
        t1 = False
    
    log('')
    t2 = step2()
    
    log('')
    t3 = step3()
    
    log('')
    t4 = step4()
    
    log('')
    log('=== OVERALL ===')
    log(f'DIAG 1 (generation): {"PASS" if t1 else "FAIL"}')
    log(f'DIAG 2 (non-blocking): {"PASS" if t2 else "FAIL"}')
    log(f'DIAG 3 (blocking): {"PASS" if t3 else "FAIL"}')
    log(f'DIAG 4 (large file): {"PASS" if t4 else "FAIL"}')
    log(f'ALL PASS: {all([t1,t2,t3,t4])}')

asyncio.run(main())
OUT.close()
print('Done - see diag_log.txt')
