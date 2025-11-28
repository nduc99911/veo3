import React, { useState, useEffect } from 'react';
import { Key, AlertCircle, ExternalLink } from 'lucide-react';

interface ApiKeyModalProps {
  onKeySelected: () => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onKeySelected }) => {
  const [error, setError] = useState<string | null>(null);

  const checkKey = async () => {
    try {
      if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
        onKeySelected();
      }
    } catch (e) {
      console.error("Error checking key:", e);
    }
  };

  useEffect(() => {
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    try {
      setError(null);
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        // Assume success if no error thrown, or check again
        await checkKey();
        // Fallback: manually trigger onKeySelected if the window method doesn't return a strictly false value on cancel
        // But for safety, we rely on checkKey() verifying it.
        // Race condition mitigation:
        setTimeout(checkKey, 500);
        setTimeout(checkKey, 2000);
      } else {
        setError("Môi trường AI Studio không khả dụng.");
      }
    } catch (err: any) {
      if (err.message && err.message.includes("Requested entity was not found")) {
        setError("Không tìm thấy dự án hoặc key không hợp lệ. Vui lòng chọn lại.");
      } else {
        setError("Đã xảy ra lỗi khi chọn Key. Vui lòng thử lại.");
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
        <div className="mx-auto w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-6">
          <Key className="w-8 h-8 text-blue-400" />
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2">Yêu cầu API Key</h2>
        <p className="text-slate-400 mb-6">
          Để sử dụng mô hình tạo video Veo 3, bạn cần chọn một API Key từ dự án Google Cloud có tính phí (Paid Tier).
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-6 flex items-center gap-2 text-red-400 text-sm text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <button
          onClick={handleSelectKey}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
        >
          Chọn API Key
        </button>

        <a 
          href="https://ai.google.dev/gemini-api/docs/billing" 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-400 transition-colors"
        >
          Tìm hiểu thêm về thanh toán <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

export default ApiKeyModal;