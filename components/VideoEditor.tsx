import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, Scissors, Type, Merge, Save, 
  RotateCcw, Download, X, Loader2, Film, Clock, AlertTriangle, Plus, Trash2, ArrowDown, AlertCircle
} from 'lucide-react';
import { GeneratedVideo } from '../types';

interface VideoEditorProps {
  video: GeneratedVideo;
  allVideos: GeneratedVideo[];
  onClose: () => void;
  onSave: (url: string) => void;
}

// Shared rendering logic for consistent WYSIWYG results
const renderFrame = (
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  text: string,
  width: number,
  height: number
) => {
  // 1. Draw Video Frame
  ctx.drawImage(source, 0, 0, width, height);

  // 2. Draw Text Overlay with Enhanced Styling
  if (text) {
    const fontSize = height * 0.08;
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    const x = width / 2;
    const y = height - (height * 0.1);
    
    // Create a strong outline/stroke for readability on any background
    ctx.lineWidth = fontSize * 0.12;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    // Draw shadow for depth
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = fontSize * 0.2;
    ctx.shadowOffsetX = fontSize * 0.05;
    ctx.shadowOffsetY = fontSize * 0.05;

    // Apply stroke
    ctx.strokeText(text, x, y);
    
    // Reset shadow for the fill to avoid muddying the text
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Apply fill
    ctx.fillStyle = 'white';
    ctx.fillText(text, x, y);
  }
};

const VideoEditor: React.FC<VideoEditorProps> = ({ video, allVideos, onClose, onSave }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit States
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [textOverlay, setTextOverlay] = useState('');
  
  // Merge Queue State (List of video IDs to append in order)
  const [mergeQueue, setMergeQueue] = useState<string[]>([]);
  // Track specific indices in the queue that failed to load
  const [failedQueueIndices, setFailedQueueIndices] = useState<Set<number>>(new Set());

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // Filter compatible videos (same aspect ratio)
  const compatibleVideos = allVideos.filter(v => 
    v.id !== video.id && 
    v.aspectRatio === video.aspectRatio
  );

  // Initialize
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.crossOrigin = "anonymous";
      videoRef.current.src = video.url;
    }
  }, [video]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setTrimEnd(dur);
      drawPreview();
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        // If at the end of trim, restart from trim start
        if (videoRef.current.currentTime >= trimEnd) {
          videoRef.current.currentTime = trimStart;
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      drawPreview();
      
      // Auto pause at trim end if playing
      if (isPlaying && videoRef.current.currentTime >= trimEnd) {
        videoRef.current.pause();
        setIsPlaying(false);
        videoRef.current.currentTime = trimStart;
      }
    }
  };

  const drawPreview = () => {
    const videoEl = videoRef.current;
    const canvas = previewCanvasRef.current;
    if (!videoEl || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video resolution for accurate preview
    if (canvas.width !== videoEl.videoWidth || canvas.height !== videoEl.videoHeight) {
      if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
      }
    }

    if (canvas.width === 0 || canvas.height === 0) return;

    renderFrame(ctx, videoEl, textOverlay, canvas.width, canvas.height);
  };

  // Sync preview while playing
  useEffect(() => {
    let animId: number;
    const loop = () => {
      if (isPlaying) {
        drawPreview();
        animId = requestAnimationFrame(loop);
      }
    };
    if (isPlaying) loop();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, textOverlay]);

  // Effect to update preview when text changes even if paused
  useEffect(() => {
    if (!isPlaying) drawPreview();
  }, [textOverlay]);

  const handleAddToQueue = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (selectedId) {
      setMergeQueue([...mergeQueue, selectedId]);
      // Reset failed indices when modifying queue structure to be safe
      setFailedQueueIndices(new Set()); 
      e.target.value = ""; // Reset select
    }
  };

  const handleRemoveFromQueue = (indexToRemove: number) => {
    setMergeQueue(mergeQueue.filter((_, index) => index !== indexToRemove));
    // Reset failed indices when modifying queue structure
    setFailedQueueIndices(new Set());
    setErrorMessage(null);
  };

  const handleClose = () => {
    // Check for unsaved changes
    const isTrimChanged = duration > 0 && (trimStart > 0.1 || Math.abs(trimEnd - duration) > 0.1);
    const isTextChanged = textOverlay.trim().length > 0;
    const isMergeChanged = mergeQueue.length > 0;

    if (isTrimChanged || isTextChanged || isMergeChanged) {
      setShowExitConfirmation(true);
    } else {
      onClose();
    }
  };

  const processVideo = async () => {
    const sourceVideo = videoRef.current;
    const canvas = canvasRef.current; // Hidden canvas for processing
    if (!sourceVideo || !canvas) return;

    setProcessing(true);
    setProgress(0);
    setIsPlaying(false);
    setErrorMessage(null);
    setFailedQueueIndices(new Set());
    sourceVideo.pause();

    try {
      // 1. Setup Canvas & Stream
      canvas.width = sourceVideo.videoWidth;
      canvas.height = sourceVideo.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      const stream = canvas.captureStream(30); // 30 FPS
      
      // 2. Setup Audio
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      const sourceNode = audioCtx.createMediaElementSource(sourceVideo);
      sourceNode.connect(dest);
      
      // Add audio track to stream
      const audioTrack = dest.stream.getAudioTracks()[0];
      if (audioTrack) stream.addTrack(audioTrack);

      // 3. Recorder
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.start();

      // 4. Processing Loop Helper
      const playSegment = async (videoEl: HTMLVideoElement, start: number, end: number, text: string) => {
        return new Promise<void>((resolve) => {
          videoEl.currentTime = start;
          
          const onPlay = () => {
             const processFrame = () => {
                if (videoEl.paused || videoEl.ended) return;

                // USE SHARED RENDER LOGIC
                renderFrame(ctx, videoEl, text, canvas.width, canvas.height);

                // Check end condition
                if (videoEl.currentTime >= end) {
                  videoEl.pause();
                  videoEl.removeEventListener('play', onPlay);
                  resolve();
                } else {
                  requestAnimationFrame(processFrame);
                }
             };
             processFrame();
          }

          videoEl.addEventListener('play', onPlay);
          videoEl.play();
        });
      };

      // 5. Execute Sequence
      
      // Part 1: Main Video (Trimmed)
      await playSegment(sourceVideo, trimStart, trimEnd, textOverlay);

      // Part 2: Merged Videos Queue
      for (let i = 0; i < mergeQueue.length; i++) {
         const mergeId = mergeQueue[i];
         const mergeVideoData = allVideos.find(v => v.id === mergeId);
         
         if (mergeVideoData) {
            try {
                // Load next video
                await new Promise<void>((resolve, reject) => {
                   const loadHandler = () => {
                      sourceVideo.removeEventListener('loadeddata', loadHandler);
                      sourceVideo.removeEventListener('error', errorHandler);
                      resolve();
                   };
                   const errorHandler = (e: any) => {
                      sourceVideo.removeEventListener('loadeddata', loadHandler);
                      sourceVideo.removeEventListener('error', errorHandler);
                      reject(new Error(`Failed to load video ID: ${mergeId}`));
                   };
                   
                   // Set timeout for loading
                   const timeoutId = setTimeout(() => {
                       sourceVideo.removeEventListener('loadeddata', loadHandler);
                       sourceVideo.removeEventListener('error', errorHandler);
                       reject(new Error(`Timeout loading video ID: ${mergeId}`));
                   }, 10000); // 10s timeout
                   
                   sourceVideo.addEventListener('loadeddata', () => clearTimeout(timeoutId));
                   sourceVideo.addEventListener('error', (e) => { clearTimeout(timeoutId); errorHandler(e); });
                   sourceVideo.addEventListener('loadeddata', loadHandler);
                   
                   sourceVideo.src = mergeVideoData.url;
                });

                // Play full next video (no text for now)
                await playSegment(sourceVideo, 0, sourceVideo.duration, '');
            } catch (err) {
                // Mark this index as failed
                setFailedQueueIndices(prev => {
                    const newSet = new Set(prev);
                    newSet.add(i);
                    return newSet;
                });
                // Re-throw to stop processing loop
                throw new Error(`Không thể tải video thứ ${i + 1} trong hàng đợi. Vui lòng kiểm tra hoặc xóa video này.`);
            }
         }
      }

      // 6. Finish
      recorder.stop();
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        onSave(url);
        setProcessing(false);
        
        // Clean up audio
        sourceNode.disconnect();
        audioCtx.close();
        
        // Restore original video src for UI
        sourceVideo.src = video.url; 
        sourceVideo.load();
      };

    } catch (e: any) {
      console.error("Processing failed", e);
      setProcessing(false);
      setErrorMessage(e.message || "Lỗi khi xử lý video. Có thể do lỗi mạng hoặc định dạng video.");
      // Restore video on error
      sourceVideo.src = video.url;
    }
  };

  return (
    <div className="relative flex flex-col h-full bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* Hidden processing elements */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Film className="w-5 h-5 text-blue-400" />
            Chỉnh sửa Video
        </h3>
        <button onClick={handleClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Preview */}
        <div className="flex-1 bg-black relative flex items-center justify-center p-4">
          <div className="relative max-w-full max-h-full aspect-video shadow-2xl">
             <canvas 
               ref={previewCanvasRef} 
               className="w-full h-full object-contain bg-slate-900" 
             />
             <video 
               ref={videoRef}
               className="hidden"
               onLoadedMetadata={handleLoadedMetadata}
               onTimeUpdate={handleTimeUpdate}
               onEnded={() => setIsPlaying(false)}
             />
             
             {/* Overlay Controls */}
             <button 
                onClick={togglePlay}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/20 transition-all z-10"
             >
               {isPlaying ? <Pause className="w-8 h-8 text-white" /> : <Play className="w-8 h-8 text-white ml-1" />}
             </button>
          </div>
          
          {processing && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                <p className="text-blue-400 font-mono animate-pulse">Đang Render Video...</p>
                <p className="text-slate-500 text-sm mt-2">Đang xử lý {1 + mergeQueue.length} video segments...</p>
            </div>
          )}

          {errorMessage && (
            <div className="absolute bottom-6 left-6 right-6 bg-red-900/90 border border-red-500/50 p-4 rounded-xl flex items-start gap-3 backdrop-blur-md z-40 animate-in fade-in slide-in-from-bottom-2">
                <AlertCircle className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
                <div className="flex-1">
                    <h4 className="text-sm font-bold text-red-200">Lỗi Xử Lý</h4>
                    <p className="text-xs text-red-300 mt-1">{errorMessage}</p>
                </div>
                <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-red-800 rounded">
                    <X className="w-4 h-4 text-red-300" />
                </button>
            </div>
          )}
        </div>

        {/* Right: Controls */}
        <div className="w-full lg:w-80 bg-slate-900 border-l border-slate-800 p-6 space-y-8 overflow-y-auto">
            
            {/* Trim Control */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-400 uppercase">
                        <Scissors className="w-4 h-4" /> Cắt (Trim)
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded border border-slate-700">
                        <Clock className="w-3 h-3" />
                        <span>Thời lượng gốc: {duration.toFixed(1)}s</span>
                    </div>
                </div>

                {/* Precision Inputs */}
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-950 border border-slate-700 rounded p-2">
                        <label className="text-[10px] text-slate-500 uppercase block mb-1">Bắt đầu (s)</label>
                        <input 
                            type="number" 
                            step={0.1}
                            min={0}
                            max={trimEnd}
                            value={Number(trimStart.toFixed(2))}
                            onChange={(e) => {
                                const val = Math.min(Number(e.target.value), trimEnd - 0.1);
                                setTrimStart(Math.max(0, val));
                                if(videoRef.current) videoRef.current.currentTime = Math.max(0, val);
                            }}
                            className="w-full bg-transparent text-sm text-white focus:outline-none font-mono"
                        />
                    </div>
                    <div className="bg-slate-950 border border-slate-700 rounded p-2">
                        <label className="text-[10px] text-slate-500 uppercase block mb-1">Kết thúc (s)</label>
                        <input 
                            type="number" 
                            step={0.1}
                            min={trimStart}
                            max={duration}
                            value={Number(trimEnd.toFixed(2))}
                            onChange={(e) => {
                                const val = Math.max(Number(e.target.value), trimStart + 0.1);
                                setTrimEnd(Math.min(duration, val));
                            }}
                            className="w-full bg-transparent text-sm text-white focus:outline-none font-mono"
                        />
                    </div>
                     <div className="bg-slate-950 border border-slate-700 rounded p-2 border-blue-500/30">
                        <label className="text-[10px] text-blue-400 uppercase block mb-1">Độ dài (s)</label>
                        <input 
                            type="number" 
                            step={0.1}
                            min={0.1}
                            max={duration}
                            value={Number((trimEnd - trimStart).toFixed(2))}
                            onChange={(e) => {
                                const newDur = Number(e.target.value);
                                const newEnd = trimStart + newDur;
                                if (newEnd <= duration) {
                                    setTrimEnd(newEnd);
                                }
                            }}
                            className="w-full bg-transparent text-sm text-blue-400 font-bold focus:outline-none font-mono"
                        />
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1">
                        <input 
                            type="range" 
                            min={0} max={duration} step={0.1}
                            value={trimStart}
                            onChange={(e) => {
                                const val = Number(e.target.value);
                                setTrimStart(val);
                                if (videoRef.current) videoRef.current.currentTime = val;
                            }}
                            className="w-full accent-blue-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div className="space-y-1">
                        <input 
                            type="range" 
                            min={0} max={duration} step={0.1}
                            value={trimEnd}
                            onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart))}
                            className="w-full accent-blue-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </div>
            </div>

            {/* Text Control */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-purple-400 uppercase">
                    <Type className="w-4 h-4" /> Chèn Text
                </div>
                <input 
                    type="text" 
                    value={textOverlay}
                    onChange={(e) => setTextOverlay(e.target.value)}
                    placeholder="Nhập nội dung..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-purple-500 text-white"
                />
            </div>

            {/* Merge Control */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400 uppercase">
                    <Merge className="w-4 h-4" /> Ghép Video
                </div>
                
                {compatibleVideos.length > 0 ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <select 
                          onChange={handleAddToQueue}
                          defaultValue=""
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm focus:outline-none focus:border-emerald-500 text-slate-300 appearance-none"
                      >
                          <option value="" disabled>-- Chọn video để thêm vào đuôi --</option>
                          {compatibleVideos.map(v => (
                              <option key={v.id} value={v.id}>
                                  {v.prompt.slice(0, 30)}...
                              </option>
                          ))}
                      </select>
                      <Plus className="absolute right-3 top-3.5 w-4 h-4 text-emerald-500 pointer-events-none" />
                    </div>

                    {/* Merge Queue List */}
                    {mergeQueue.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-slate-500 uppercase font-semibold">Thứ tự phát:</p>
                        
                        {/* Main Video Indicator */}
                        <div className="bg-slate-800/50 border border-slate-700 rounded p-2 flex gap-3 items-center opacity-70">
                           <div className="w-16 h-10 bg-black rounded overflow-hidden flex-shrink-0 border border-slate-700">
                             <img src={`data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60" viewBox="0 0 100 60"><rect width="100" height="60" fill="#1e293b"/><text x="50" y="35" font-family="sans-serif" font-size="12" fill="#64748b" text-anchor="middle">Main</text></svg>')}`} className="w-full h-full object-cover" alt="Main" />
                           </div>
                           <div className="min-w-0 flex-1">
                             <p className="text-xs text-slate-300 truncate">Video Chính (Đang sửa)</p>
                             <p className="text-[10px] text-slate-500">Phát đầu tiên</p>
                           </div>
                        </div>
                        
                        <div className="flex justify-center">
                          <ArrowDown className="w-4 h-4 text-slate-600" />
                        </div>

                        {/* Queue Items */}
                        {mergeQueue.map((id, index) => {
                           const vid = allVideos.find(v => v.id === id);
                           if (!vid) return null;
                           const isFailed = failedQueueIndices.has(index);

                           return (
                             <div key={`${id}-${index}`} className="group relative">
                               <div className={`border rounded p-2 flex gap-3 items-center transition-colors ${
                                   isFailed 
                                   ? 'bg-red-900/20 border-red-500/50' 
                                   : 'bg-slate-950 border-slate-700 hover:border-emerald-500/50'
                               }`}>
                                  <div className={`w-16 h-10 bg-black rounded overflow-hidden flex-shrink-0 border ${isFailed ? 'border-red-500/30' : 'border-slate-700'}`}>
                                    <video src={vid.url} className="w-full h-full object-cover" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                        <p className={`text-xs truncate font-medium ${isFailed ? 'text-red-300' : 'text-slate-300'}`}>{vid.prompt}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {isFailed ? (
                                            <span className="text-[10px] text-red-400 font-bold flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" /> Lỗi tải
                                            </span>
                                        ) : (
                                            <p className="text-[10px] text-slate-500">#{index + 1} trong hàng chờ</p>
                                        )}
                                    </div>
                                  </div>
                                  <button 
                                    onClick={() => handleRemoveFromQueue(index)}
                                    className={`p-1.5 rounded transition-colors ${
                                        isFailed 
                                        ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' 
                                        : 'hover:bg-red-500/10 text-slate-500 hover:text-red-400'
                                    }`}
                                    title={isFailed ? "Xóa video lỗi" : "Xóa khỏi hàng chờ"}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                               </div>
                               {index < mergeQueue.length - 1 && (
                                  <div className="flex justify-center my-1">
                                    <ArrowDown className="w-3 h-3 text-slate-700" />
                                  </div>
                               )}
                             </div>
                           );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic p-2 bg-slate-950 rounded border border-slate-800">
                    Không có video nào cùng tỷ lệ khung hình trong lịch sử để ghép.
                  </p>
                )}
            </div>

            {/* Actions */}
            <div className="pt-6 border-t border-slate-800">
                <button 
                    onClick={processVideo}
                    disabled={processing}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all"
                >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Xuất Video Mới
                </button>
            </div>

        </div>
      </div>

      {/* Exit Confirmation Modal */}
      {showExitConfirmation && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl transform scale-100 transition-all">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <h3 className="text-xl font-bold text-white">Chưa lưu thay đổi</h3>
              <p className="text-slate-400 text-sm">
                Bạn có chắc chắn muốn thoát? Các chỉnh sửa video chưa được xuất sẽ bị mất.
              </p>
              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={() => setShowExitConfirmation(false)}
                  className="flex-1 py-2 px-4 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-700 transition-colors"
                >
                  Quay lại
                </button>
                <button
                  onClick={() => { setShowExitConfirmation(false); onClose(); }}
                  className="flex-1 py-2 px-4 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500 transition-colors"
                >
                  Thoát
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoEditor;