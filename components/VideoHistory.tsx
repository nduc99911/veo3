import React from 'react';
import { GeneratedVideo, AspectRatio } from '../types';
import { Download, Play, RefreshCw, Scissors, Share2 } from 'lucide-react';

interface VideoHistoryProps {
  videos: GeneratedVideo[];
  onExtend: (video: GeneratedVideo) => void;
  onEdit: (video: GeneratedVideo) => void;
}

const VideoHistory: React.FC<VideoHistoryProps> = ({ videos, onExtend, onEdit }) => {
  if (videos.length === 0) return null;

  const handleShare = async (video: GeneratedVideo) => {
    try {
      const shareData = {
        title: 'Veo AI Video',
        text: `Xem video tôi vừa tạo với Veo AI: "${video.prompt}"`,
        url: video.url,
      };

      if (navigator.share && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(video.url);
        alert('Đã sao chép liên kết video vào bộ nhớ tạm!');
      }
    } catch (error) {
      console.log('Error sharing:', error);
    }
  };

  return (
    <div className="mt-12">
      <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
        <Play className="w-5 h-5 text-blue-400" />
        Lịch sử Video của bạn
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {videos.map((video) => (
          <div key={video.id} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-blue-500/50 transition-all shadow-lg flex flex-col">
            <div className={`relative bg-black ${video.aspectRatio === AspectRatio.Portrait ? 'aspect-[9/16]' : 'aspect-video'}`}>
              <video 
                src={video.url} 
                controls 
                className="w-full h-full object-contain" 
                poster="https://picsum.photos/400/225" // Fallback placeholder
                playsInline
                crossOrigin="anonymous" // Important for canvas operations later
              />
            </div>
            <div className="p-4 flex flex-col flex-1">
              <p className="text-sm text-slate-300 line-clamp-2 mb-3 font-medium flex-1" title={video.prompt}>
                {video.prompt || "Không có mô tả"}
              </p>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                <span>{video.model.replace('veo-3.1-', '')}</span>
                <span>{new Date(video.createdAt).toLocaleTimeString()}</span>
              </div>
              
              {/* Actions Grid */}
              <div className="grid grid-cols-2 gap-2 mt-auto">
                <a 
                  href={video.url} 
                  download={`veo-video-${video.id}.mp4`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold text-white transition-colors"
                  title="Tải về"
                >
                  <Download className="w-3 h-3" /> Tải về
                </a>
                
                <button
                   onClick={() => handleShare(video)}
                   className="flex items-center justify-center gap-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold text-white transition-colors"
                   title="Chia sẻ"
                >
                  <Share2 className="w-3 h-3" /> Chia sẻ
                </button>

                <button
                   onClick={() => onEdit(video)}
                   className="flex items-center justify-center gap-1 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg text-xs font-semibold transition-colors"
                   title="Chỉnh sửa (Cắt, Text, Ghép)"
                >
                  <Scissors className="w-3 h-3" /> Sửa
                </button>
                
                <button
                   onClick={() => onExtend(video)}
                   className="flex items-center justify-center gap-1 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-semibold transition-colors"
                   title="Tạo thêm 7 giây"
                >
                  <RefreshCw className="w-3 h-3" /> Mở rộng
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VideoHistory;