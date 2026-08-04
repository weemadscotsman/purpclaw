'use strict';

/**
 * LOCAL VIDEO STITCHING ENGINE — PURPCLAW
 * =====================================
 *
 * Uses ffmpeg to compile image slides or video segments, audio files, 
 * and text subtitles into a single finished MP4 video file.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper to run ffmpeg
function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    console.log(`[video-engine] Running: ffmpeg ${args.join(' ')}`);
    const child = spawn('ffmpeg', args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}. Stderr: ${stderr}`));
      }
    });
    child.on('error', reject);
  });
}

// Helper to get audio duration using ffprobe
function getAudioDuration(audioPath) {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath
    ], { windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.on('close', (code) => {
      const dur = parseFloat(stdout.trim());
      if (code === 0 && !isNaN(dur)) {
        resolve(dur);
      } else {
        resolve(5.0); // Default fallback
      }
    });
    child.on('error', () => resolve(5.0));
  });
}

/**
 * Stitch video segments into a final MP4
 * @param {Array} segments - Array of { imagePath, videoPath, audioPath, text, duration }
 * @param {Object} options - { musicPath, musicVolume, outputPath }
 */
async function stitchVideo(segments, options = {}) {
  if (!segments || segments.length === 0) {
    throw new Error('No segments provided for video stitching');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'purpclaw-video-'));
  const clipPaths = [];

  try {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const clipPath = path.join(tempDir, `clip_${i}.mp4`);
      
      // Determine duration
      let duration = seg.duration;
      if (!duration && seg.audioPath && fs.existsSync(seg.audioPath)) {
        duration = await getAudioDuration(seg.audioPath);
      }
      if (!duration) duration = 5.0; // Fallback to 5 seconds

      // Compile segment clip
      const args = [];
      
      // Visual source
      let hasVideo = false;
      if (seg.videoPath && fs.existsSync(seg.videoPath)) {
        args.push('-i', seg.videoPath);
        hasVideo = true;
      } else if (seg.imagePath && fs.existsSync(seg.imagePath)) {
        args.push('-loop', '1', '-t', duration.toString(), '-i', seg.imagePath);
      } else {
        // Fallback solid black frame if no visual asset is provided
        args.push('-f', 'lavfi', '-i', `color=c=black:s=1080x1920:d=${duration}`, '-t', duration.toString());
      }

      // Audio source
      let hasAudio = false;
      if (seg.audioPath && fs.existsSync(seg.audioPath)) {
        args.push('-i', seg.audioPath);
        hasAudio = true;
      } else {
        // Fallback silent audio
        args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', duration.toString());
      }

      // Filters: Scale/crop to vertical 9:16 (1080x1920) or landscape 16:9 (1920x1080)
      // Burning subtitles via drawtext.
      let vf = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';
      if (seg.text) {
        // Escape text for drawtext filter (colon, backslash, singlequote)
        const escapedText = seg.text
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "'\\''")
          .replace(/:/g, '\\:');
        
        let fontfileOpt = '';
        if (process.platform === 'win32') {
          const winFont = 'C:/Windows/Fonts/arial.ttf';
          if (fs.existsSync(winFont)) {
            fontfileOpt = `:fontfile='C\\:/Windows/Fonts/arial.ttf'`;
          }
        }
        
        // drawtext filter settings
        vf += `,drawtext=text='${escapedText}'${fontfileOpt}:x=(w-text_w)/2:y=h-300:fontsize=48:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=15:line_spacing=10`;
      }

      args.push('-vf', vf);
      
      // Audio codec & mapping
      if (hasVideo && hasAudio) {
        args.push('-map', '0:v:0', '-map', '1:a:0');
      } else {
        args.push('-map', '0:v:0', '-map', '1:a:0');
      }

      // Audio/Video encoding parameters
      args.push(
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        clipPath
      );

      await runFFmpeg(args);
      clipPaths.push(clipPath);
    }

    // Concatenate all segment clips
    const concatListPath = path.join(tempDir, 'concat_list.txt');
    const concatListContent = clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatListPath, concatListContent, 'utf8');

    const rawOutputPath = path.join(tempDir, 'raw_concat.mp4');
    const concatArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      rawOutputPath
    ];
    await runFFmpeg(concatArgs);

    // Apply background music if provided
    const finalOutputPath = options.outputPath || path.join(process.cwd(), `reel_${Date.now()}.mp4`);
    
    if (options.musicPath && fs.existsSync(options.musicPath)) {
      const musicVol = options.musicVolume || 0.15;
      const finalArgs = [
        '-i', rawOutputPath,
        '-i', options.musicPath,
        '-filter_complex', `[1:a]volume=${musicVol}[bg];[0:a][bg]amix=inputs=2:duration=first[a]`,
        '-map', '0:v:0',
        '-map', '[a]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        finalOutputPath
      ];
      await runFFmpeg(finalArgs);
    } else {
      fs.copyFileSync(rawOutputPath, finalOutputPath);
    }

    console.log(`[video-engine] Final video compiled successfully: ${finalOutputPath}`);
    return finalOutputPath;

  } finally {
    // Clean up temporary files
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    } catch (e) {
      console.error(`[video-engine] Temp dir cleanup error: ${e.message}`);
    }
  }
}

module.exports = {
  stitchVideo
};
