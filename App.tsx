import React, { useState, useRef, useEffect } from 'react';
import { 
  Video, Sparkles, Image as ImageIcon, Wand2, 
  Settings2, Loader2, Upload, AlertTriangle, FolderOpen, Users, X, Film, Key, Layers, CheckCircle2
} from 'lucide-react';
import { 
  VeoModel, AspectRatio, Resolution, 
  GeneratedVideo, GenerationStatus, VideoConfig 
} from './types';
import { generateVideoRaw } from './services/veoService';
import VideoHistory from './components/VideoHistory';
import VideoEditor from './components/VideoEditor';

// Extend window object for AI Studio
declare global {
  interface Window {
    showDirectoryPicker: (options?: any) => Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemHandle {
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'bulk' | 'extend' | 'editor'>('create');
  
  // API Key State
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('veo_api_key') || '');

  // Form State
  const [prompt, setPrompt] = useState('');
  const [bulkPrompts, setBulkPrompts] = useState<string[]>(['', '', '', '', '']); // 5 scenes
  const [model, setModel] = useState<VeoModel>(VeoModel.Fast);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.Landscape);
  const [resolution, setResolution] = useState<Resolution>(Resolution.Res720p);
  
  // Image Inputs
  const [imageStart, setImageStart] = useState<string | null>(null);
  const [imageEnd, setImageEnd] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  
  // Extension & Editor State
  const [selectedVideoToExtend, setSelectedVideoToExtend] = useState<GeneratedVideo | null>(null);
  const [selectedVideoToEdit, setSelectedVideoToEdit] = useState<GeneratedVideo | null>(null);

  // App State
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  
  // File System Output
  const [outputDirHandle, setOutputDirHandle] = useState<any>(null); // FileSystemDirectoryHandle
  
  const fileInputStartRef = useRef<HTMLInputElement>(null);
  const fileInputEndRef = useRef<HTMLInputElement>(null);
  const fileInputRefRef = useRef<HTMLInputElement>(null);

  // Character consistency constraints
  const isCharacterConsistencyMode = referenceImages.length > 0;

  useEffect(() => {
    localStorage.setItem('veo_api_key', userApiKey);
  }, [userApiKey]);

  useEffect(() => {
    // Auto-configure settings if character consistency is active
    if (isCharacterConsistencyMode) {
      setModel(VeoModel.Quality);
      // Note: We now allow user to select Aspect Ratio (e.g. 9:16) for consistency mode
      // setAspectRatio(AspectRatio.Landscape); 
      setResolution(Resolution.Res720p);
    }
  }, [isCharacterConsistencyMode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setFunc: (s: string | null) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError("Vui lòng chỉ chọn file hình ảnh (PNG, JPG).");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1];
        setFunc(base64Data);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReferenceImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (referenceImages.length >= 3) {
        setError("Tối đa 3 ảnh tham chiếu nhân vật.");
        return;
      }
      if (!file.type.startsWith('image/')) {
        setError("Vui lòng chỉ chọn file hình ảnh (PNG, JPG).");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(',')[1];
        setReferenceImages(prev => [...prev, base64Data]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleBulkPromptChange = (index: number, value: string) => {
    const newPrompts = [...bulkPrompts];
    newPrompts[index] = value;
    setBulkPrompts(newPrompts);
  };

  const handleSelectOutputFolder = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        // Explicitly request readwrite mode
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        
        // We can't guarantee persistence, but we can verify current access
        if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
          setOutputDirHandle(handle);
          setError(null);
        } else {
          // Attempt to request if not granted immediately
          if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') {
            setOutputDirHandle(handle);
            setError(null);
          } else {
             setError("Bạn cần cấp quyền 'Ghi' (Write) để ứng dụng có thể tự động lưu video.");
          }
        }
      } else {
        setError("Trình duyệt của bạn không hỗ trợ chọn thư mục (File System Access API).");
      }
    } catch (e) {
      console.error("User cancelled folder selection or error:", e);
    }
  };

  const saveToDisk = async (url: string, filename: string) => {
    if (!outputDirHandle) return;
    try {
      setStatusMessage(`Đang lưu vào thư mục: ${outputDirHandle.name}...`);
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Lỗi tải video từ server (Status: ${response.status})`);
      
      const blob = await response.blob();
      
      const fileHandle = await outputDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      console.log("File saved successfully to folder.");
    } catch (err: any) {
      console.error("Error saving to folder:", err);
      // Soft error - do not disrupt the app flow
      setError(`Không thể lưu file vào thư mục "${outputDirHandle.name}". Vui lòng kiểm tra quyền truy cập.`);
      
      if (err.name === 'NotAllowedError' || err.message.includes('permission')) {
          setOutputDirHandle(null);
      }
    }
  };

  const generateSingle = async (cfg: VideoConfig, label: string): Promise<GeneratedVideo> => {
     const result = await generateVideoRaw(cfg, setStatusMessage, userApiKey);
     const timestamp = Date.now();
     const filename = `veo-${label.replace(/\s+/g, '-')}-${timestamp}.mp4`;
     
     if (outputDirHandle) {
        await saveToDisk(result.url, filename);
     }

     return {
        id: timestamp.toString(),
        url: result.url,
        prompt: cfg.prompt,
        createdAt: new Date(),
        model: isCharacterConsistencyMode ? 'veo-3.1-generate-preview (Character)' : cfg.model,
        videoObject: result.videoObject,
        aspectRatio: cfg.aspectRatio,
     };
  };

  const handleGenerate = async () => {
    if (!userApiKey.trim()) {
      setError("Vui lòng nhập API Key trong phần Cài đặt bên phải.");
      return;
    }

    setStatus('generating');
    setError(null);

    try {
        if (activeTab === 'bulk') {
            const activeIndices = bulkPrompts.map((p, i) => p.trim() ? i : -1).filter(i => i !== -1);
            if (activeIndices.length === 0) {
                throw new Error("Vui lòng nhập ít nhất một mô tả phân cảnh.");
            }

            for (let i = 0; i < activeIndices.length; i++) {
                const idx = activeIndices[i];
                const scenePrompt = bulkPrompts[idx];
                const currentSceneNum = i + 1;
                const totalScenes = activeIndices.length;

                setStatusMessage(`Đang xử lý Cảnh ${currentSceneNum}/${totalScenes}...`);

                const config: VideoConfig = {
                    prompt: scenePrompt,
                    model: model, 
                    aspectRatio: aspectRatio, 
                    resolution: resolution,
                    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
                };
                
                try {
                    const newVideo = await generateSingle(config, `scene-${idx + 1}`);
                    setVideos(prev => [newVideo, ...prev]);
                } catch (sceneErr: any) {
                    console.error(`Error generating scene ${idx+1}:`, sceneErr);
                    // We continue to next scene even if one fails, but show toast?
                    // For now just log and set global error but continue
                    setError(`Lỗi tạo cảnh ${idx+1}: ${sceneErr.message}`);
                }
            }

        } else {
            // Single Generation Logic
            if (!prompt.trim() && !imageStart && referenceImages.length === 0) {
                throw new Error("Vui lòng nhập mô tả hoặc tải lên hình ảnh.");
            }
            
            setStatusMessage('Đang khởi tạo yêu cầu...');

            const config: VideoConfig = {
                prompt,
                model,
                aspectRatio,
                resolution,
                imageStart: imageStart || undefined,
                imageEnd: imageEnd || undefined,
                referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
            };
    
            if (activeTab === 'extend') {
                if (!selectedVideoToExtend) {
                  throw new Error("Vui lòng chọn một video từ lịch sử để mở rộng.");
                }
                config.previousVideo = selectedVideoToExtend.videoObject;
                config.model = VeoModel.Quality;
            }
    
            const newVideo = await generateSingle(config, activeTab === 'extend' ? 'extended' : 'gen');
            setVideos(prev => [newVideo, ...prev]);
        }

      setStatus('completed');
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Đã xảy ra lỗi không xác định.");
      setStatus('error');
    }
  };

  const onExtendRequest = (video: GeneratedVideo) => {
    setImageStart(null);
    setImageEnd(null);
    setReferenceImages([]);
    setSelectedVideoToExtend(video);
    setActiveTab('extend');
    setAspectRatio(video.aspectRatio as AspectRatio); 
    setPrompt(`Extension of: ${video.prompt.slice(0, 50)}...`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onEditRequest = (video: GeneratedVideo) => {
    setSelectedVideoToEdit(video);
    setActiveTab('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEditorSave = async (url: string) => {
    const timestamp = Date.now();
    const newVideo: GeneratedVideo = {
      id: timestamp.toString(),
      url: url,
      prompt: `Edited: ${selectedVideoToEdit?.prompt}`,
      createdAt: new Date(),
      model: 'Edited Video',
      aspectRatio: selectedVideoToEdit?.aspectRatio || AspectRatio.Landscape,
    };
    
    setVideos(prev => [newVideo, ...prev]);
    setActiveTab('create');
    setSelectedVideoToEdit(null);

    if (outputDirHandle) {
       await saveToDisk(url, `veo-edited-${timestamp}.webm`);
    }
  };

  // Render Logic for Inputs
  const renderReferenceImagesInput = () => (
    <div className="pt-4 border-t border-slate-800">
        <label className="flex items-center gap-2 text-sm font-semibold text-blue-300 uppercase tracking-wider mb-3">
        <Users className="w-4 h-4" /> Đồng bộ Nhân vật (Tối đa 3 ảnh)
        </label>
        <p className="text-xs text-slate-500 mb-3">
            Tải lên hình ảnh tham chiếu để giữ nhân vật nhất quán giữa các cảnh. <br/>
            <span className="text-amber-500">Lưu ý: Tính năng này yêu cầu Veo Quality và 720p. Tỷ lệ 16:9 hoặc 9:16.</span>
        </p>
        
        <div className="flex gap-3 overflow-x-auto pb-2">
            {referenceImages.map((img, idx) => (
                <div key={idx} className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden border border-slate-700 group">
                    <img src={`data:image/png;base64,${img}`} className="w-full h-full object-cover" alt={`Ref ${idx}`} />
                    <button 
                        onClick={() => removeReferenceImage(idx)}
                        className="absolute top-0 right-0 bg-red-500/80 p-1 rounded-bl text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ))}
            {referenceImages.length < 3 && (
                <button 
                    onClick={() => fileInputRefRef.current?.click()}
                    className="w-20 h-20 shrink-0 rounded-lg border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-950 flex items-center justify-center transition-colors"
                >
                    <Users className="w-6 h-6 text-slate-600" />
                </button>
            )}
        </div>
        <input type="file" ref={fileInputRefRef} onChange={handleReferenceImageAdd} className="hidden" accept="image/*" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-blue-500/30">
      
      {/* Header */}
      <header className="fixed top-0 w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
              <Video className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight">Veo <span className="text-blue-400">Creator</span></span>
          </div>
          <div className="flex items-center gap-4">
            {outputDirHandle && (
               <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/30 px-3 py-1.5 rounded-full border border-emerald-900">
                 <FolderOpen className="w-3 h-3" />
                 {outputDirHandle.name}
               </div>
            )}
            <div className="text-xs font-mono text-slate-500 bg-slate-900 px-2 py-1 rounded border border-slate-800">
              Preview Mode
            </div>
          </div>
        </div>
      </header>

      <main className="pt-24 pb-12 px-4 max-w-5xl mx-auto">
        
        {/* Intro */}
        <div className="mb-10 text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 pb-2">
            Biến ý tưởng thành Video
          </h1>
          <p className="text-slate-400 max-w-2xl mx-auto text-lg">
            Sử dụng sức mạnh của Google Veo 3 để tạo ra các video điện ảnh 1080p, mở rộng clip, hoặc tạo hàng loạt phân cảnh.
          </p>
        </div>

        {/* EDITOR MODE */}
        {activeTab === 'editor' && selectedVideoToEdit ? (
           <VideoEditor 
             video={selectedVideoToEdit} 
             allVideos={videos}
             onClose={() => setActiveTab('create')}
             onSave={handleEditorSave}
           />
        ) : (
          /* Main Interface */
          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* Left Column: Controls */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Tabs */}
              <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveTab('create')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'create' 
                      ? 'bg-slate-800 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" /> Tạo Mới
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('bulk')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'bulk' 
                      ? 'bg-slate-800 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Layers className="w-4 h-4" /> Hàng Loạt
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('extend')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'extend' 
                      ? 'bg-slate-800 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Wand2 className="w-4 h-4" /> Mở Rộng
                  </div>
                </button>
              </div>

              {/* Form */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
                
                {activeTab === 'bulk' ? (
                    <div className="space-y-6">
                        <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                            <h4 className="text-sm font-bold text-blue-300 mb-2 flex items-center gap-2">
                                <Layers className="w-4 h-4" /> Chế độ Tạo Hàng Loạt (Bulk)
                            </h4>
                            <p className="text-sm text-slate-400">
                                Nhập tối đa 5 phân cảnh khác nhau. Hệ thống sẽ tạo lần lượt từng video theo cài đặt bên phải (9:16, 16:9...).
                            </p>
                        </div>
                        
                        <div className="space-y-4">
                            {bulkPrompts.map((p, idx) => (
                                <div key={idx} className="relative">
                                    <div className="absolute left-3 top-3 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-400 font-bold border border-slate-700">
                                        {idx + 1}
                                    </div>
                                    <textarea
                                        value={p}
                                        onChange={(e) => handleBulkPromptChange(idx, e.target.value)}
                                        placeholder={`Mô tả phân cảnh ${idx + 1}...`}
                                        className="w-full h-20 bg-slate-950 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                                    />
                                </div>
                            ))}
                        </div>

                        {renderReferenceImagesInput()}
                    </div>
                ) : (
                    /* Standard & Extend Inputs */
                    <>
                        {/* Prompt Input */}
                        <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Mô tả ý tưởng của bạn (Prompt)
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={activeTab === 'extend' ? "Mô tả điều gì xảy ra tiếp theo..." : "Một con mèo máy đang lướt ván trong thành phố tương lai cyberpunk, đèn neon rực rỡ..."}
                            className="w-full h-32 bg-slate-950 border border-slate-700 rounded-xl p-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
                        />
                        </div>

                        {/* Create Mode Inputs */}
                        {activeTab === 'create' && (
                        <div className="space-y-6">
                            {/* Standard Image Inputs */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    Ảnh Bắt đầu (Start)
                                    </label>
                                    <div 
                                    onClick={() => fileInputStartRef.current?.click()}
                                    className={`h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${
                                        imageStart ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 hover:border-slate-500 bg-slate-950'
                                    }`}
                                    >
                                    {imageStart ? (
                                        <img src={`data:image/png;base64,${imageStart}`} alt="Start" className="h-full w-full object-cover" />
                                    ) : (
                                        <>
                                        <ImageIcon className="w-5 h-5 text-slate-500 mb-1" />
                                        <span className="text-xs text-slate-500">Tải ảnh</span>
                                        </>
                                    )}
                                    </div>
                                    <input type="file" ref={fileInputStartRef} onChange={(e) => handleFileChange(e, setImageStart)} className="hidden" accept="image/*" />
                                    {imageStart && <button onClick={(e) => {e.stopPropagation(); setImageStart(null)}} className="text-xs text-red-400 mt-1 hover:underline">Xóa</button>}
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    Ảnh Kết thúc (End)
                                    </label>
                                    <div 
                                    onClick={() => fileInputEndRef.current?.click()}
                                    className={`h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${
                                        imageEnd ? 'border-purple-500 bg-purple-500/10' : 'border-slate-700 hover:border-slate-500 bg-slate-950'
                                    }`}
                                    >
                                    {imageEnd ? (
                                        <img src={`data:image/png;base64,${imageEnd}`} alt="End" className="h-full w-full object-cover" />
                                    ) : (
                                        <>
                                        <ImageIcon className="w-5 h-5 text-slate-500 mb-1" />
                                        <span className="text-xs text-slate-500">Tải ảnh</span>
                                        </>
                                    )}
                                    </div>
                                    <input type="file" ref={fileInputEndRef} onChange={(e) => handleFileChange(e, setImageEnd)} className="hidden" accept="image/*" />
                                    {imageEnd && <button onClick={(e) => {e.stopPropagation(); setImageEnd(null)}} className="text-xs text-red-400 mt-1 hover:underline">Xóa</button>}
                                </div>
                            </div>

                            {renderReferenceImagesInput()}
                        </div>
                        )}
                    </>
                )}

                {/* Extension Mode Info */}
                {activeTab === 'extend' && (
                  <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-blue-300 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Chế độ Mở rộng
                    </h4>
                    {selectedVideoToExtend ? (
                      <div className="flex items-center gap-4">
                          <div className="w-20 h-12 bg-black rounded overflow-hidden">
                            <video src={selectedVideoToExtend.url} className="w-full h-full object-cover" />
                          </div>
                          <div className="text-sm text-slate-300">
                              Đang mở rộng video ID: <span className="font-mono">{selectedVideoToExtend.id}</span>
                          </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">
                        Hãy chọn một video từ phần "Lịch sử" bên dưới và nhấn nút "Mở rộng" để bắt đầu.
                      </p>
                    )}
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleGenerate}
                  disabled={status === 'generating'}
                  className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
                    status === 'generating' 
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/25'
                  }`}
                >
                  {status === 'generating' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {statusMessage}
                    </>
                  ) : (
                    <>
                      {activeTab === 'extend' && <Upload className="w-5 h-5" />}
                      {activeTab === 'bulk' && <Layers className="w-5 h-5" />}
                      {activeTab === 'create' && <Sparkles className="w-5 h-5" />}
                      
                      {activeTab === 'extend' ? 'Mở Rộng Video' : activeTab === 'bulk' ? 'Tạo Hàng Loạt' : 'Tạo Video'}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Settings */}
            <div className="space-y-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 sticky top-24">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-purple-400" />
                  Cài đặt
                </h3>

                <div className="space-y-6">

                  {/* API Key Setting */}
                  <div className="pb-6 border-b border-slate-800">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block flex items-center gap-1">
                      <Key className="w-3 h-3" /> API Key
                    </label>
                    <input 
                      type="password"
                      value={userApiKey}
                      onChange={(e) => setUserApiKey(e.target.value)}
                      placeholder="Dán API Key vào đây..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 text-sm focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-2">
                       Key được lưu cục bộ trên trình duyệt của bạn.
                    </p>
                  </div>
                  
                  {/* Output Folder Selection */}
                  <div className="pb-6 border-b border-slate-800">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">
                          Thư mục Output
                      </label>
                      <button 
                          onClick={handleSelectOutputFolder}
                          className={`w-full py-2 px-3 rounded-lg border flex items-center justify-center gap-2 transition-all text-sm ${
                              outputDirHandle 
                              ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-400' 
                              : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
                          }`}
                      >
                          <FolderOpen className="w-4 h-4" />
                          {outputDirHandle ? "Đã chọn (Thay đổi)" : "Chọn thư mục lưu..."}
                      </button>
                      {outputDirHandle && (
                          <p className="mt-2 text-xs text-emerald-500/70 truncate">
                              Lưu tại: {outputDirHandle.name}
                          </p>
                      )}
                  </div>

                  {/* Model Selection */}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">
                      Mô hình (Model)
                    </label>
                    <div className="space-y-2">
                      <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${model === VeoModel.Fast ? 'bg-blue-600/10 border-blue-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'} ${isCharacterConsistencyMode ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${model === VeoModel.Fast ? 'border-blue-500' : 'border-slate-600'}`}>
                            {model === VeoModel.Fast && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                          </div>
                          <div>
                            <span className="block text-sm font-medium text-slate-200">Veo Fast</span>
                            <span className="block text-xs text-slate-500">Tạo nhanh, xem trước</span>
                          </div>
                        </div>
                        <input type="radio" name="model" className="hidden" checked={model === VeoModel.Fast} onChange={() => setModel(VeoModel.Fast)} disabled={activeTab === 'extend' || isCharacterConsistencyMode} />
                      </label>

                      <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${model === VeoModel.Quality ? 'bg-purple-600/10 border-purple-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'} ${isCharacterConsistencyMode ? 'bg-purple-600/10 border-purple-500/50' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${model === VeoModel.Quality ? 'border-purple-500' : 'border-slate-600'}`}>
                            {model === VeoModel.Quality && <div className="w-2 h-2 bg-purple-500 rounded-full" />}
                          </div>
                          <div>
                            <span className="block text-sm font-medium text-slate-200">Veo Quality</span>
                            <span className="block text-xs text-slate-500">Chất lượng cao (chậm hơn)</span>
                          </div>
                        </div>
                        <input type="radio" name="model" className="hidden" checked={model === VeoModel.Quality} onChange={() => setModel(VeoModel.Quality)} />
                      </label>
                    </div>
                  </div>

                  {/* Aspect Ratio */}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">
                      Tỷ lệ khung hình
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setAspectRatio(AspectRatio.Landscape)}
                        disabled={activeTab === 'extend'}
                        className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${aspectRatio === AspectRatio.Landscape ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                      >
                        <div className="w-8 h-5 border-2 border-current rounded-sm"></div>
                        <span className="text-xs font-medium">16:9 (Ngang)</span>
                      </button>
                      <button 
                        onClick={() => setAspectRatio(AspectRatio.Portrait)}
                        disabled={activeTab === 'extend'}
                        className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${aspectRatio === AspectRatio.Portrait ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                      >
                        <div className="w-5 h-8 border-2 border-current rounded-sm"></div>
                        <span className="text-xs font-medium">9:16 (Dọc)</span>
                      </button>
                    </div>
                  </div>

                  {/* Resolution */}
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">
                      Độ phân giải
                    </label>
                    <select 
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value as Resolution)}
                      disabled={activeTab === 'extend' || isCharacterConsistencyMode}
                      className={`w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 text-sm focus:outline-none focus:border-blue-500 ${isCharacterConsistencyMode ? 'opacity-70' : ''}`}
                    >
                      <option value={Resolution.Res720p}>720p HD (Nhanh)</option>
                      <option value={Resolution.Res1080p} disabled={isCharacterConsistencyMode}>1080p Full HD</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* History Section - Only show when not editing */}
        {activeTab !== 'editor' && (
          <VideoHistory 
             videos={videos} 
             onExtend={onExtendRequest} 
             onEdit={onEditRequest}
          />
        )}
        
      </main>
    </div>
  );
};

export default App;