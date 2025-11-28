import { GoogleGenAI } from "@google/genai";
import { VideoConfig, VeoModel } from "../types";

// Helper to wait
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to map API errors to user-friendly messages
const mapErrorMessage = (error: any): string => {
  const msg = (error.message || error.toString()).toLowerCase();

  if (msg.includes('429') || msg.includes('resource exhausted') || msg.includes('quota')) {
    return 'Lỗi API: Không đủ hạn mức (Quota Exceeded) hoặc hệ thống quá tải. Vui lòng thử lại sau.';
  }
  if (msg.includes('400') || msg.includes('invalid_argument') || msg.includes('invalid argument')) {
    return 'Lỗi định dạng đầu vào: Prompt hoặc tham số ảnh không hợp lệ. Vui lòng kiểm tra lại.';
  }
  if (msg.includes('401') || msg.includes('unauthenticated') || msg.includes('key')) {
    return 'Lỗi xác thực: API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại trong Cài đặt.';
  }
  if (msg.includes('403') || msg.includes('permission denied')) {
    return 'Lỗi quyền truy cập: Dự án chưa kích hoạt Billing hoặc không được phép truy cập Veo.';
  }
  if (msg.includes('500') || msg.includes('internal')) {
    return 'Lỗi máy chủ Google: Đã xảy ra sự cố nội bộ. Vui lòng thử lại.';
  }
  if (msg.includes('safety') || msg.includes('blocked')) {
    return 'Lỗi an toàn: Nội dung yêu cầu bị chặn bởi bộ lọc an toàn của Google.';
  }
  if (msg.includes('requested entity was not found')) {
    return 'Lỗi dữ liệu: Không tìm thấy tài nguyên yêu cầu (Video gốc có thể đã hết hạn).';
  }

  return `Lỗi hệ thống: ${error.message || msg}`;
};

export const generateVideo = async (config: VideoConfig, onProgress?: (status: string) => void, apiKey?: string): Promise<string> => {
  const result = await generateVideoRaw(config, onProgress, apiKey);
  return result.url;
};

// We also export a function to get the full video object for the history state
export const generateVideoRaw = async (config: VideoConfig, onProgress?: (status: string) => void, apiKey?: string) => {
    // Prioritize user-provided key, fallback to env if available (though env might be empty in this context)
    const finalApiKey = apiKey || process.env.API_KEY;
    
    if (!finalApiKey) {
        throw new Error("Vui lòng nhập Google API Key trong phần Cài đặt.");
    }

    const ai = new GoogleGenAI({ apiKey: finalApiKey });
    let operation;

    try {
        onProgress?.("Initializing generation request...");

        // 1. EXTENSION MODE
        if (config.previousVideo) {
            onProgress?.("Processing video context for extension...");
            operation = await ai.models.generateVideos({
                model: 'veo-3.1-generate-preview',
                prompt: config.prompt,
                video: config.previousVideo,
                config: {
                    numberOfVideos: 1,
                    resolution: '720p',
                    aspectRatio: config.aspectRatio,
                }
            });
        } 
        // 2. CHARACTER CONSISTENCY MODE (Reference Images)
        else if (config.referenceImages && config.referenceImages.length > 0) {
            onProgress?.("Processing character reference images...");
            // Build reference images payload
            const referenceImagesPayload = config.referenceImages.map(img => ({
                image: {
                    imageBytes: img,
                    mimeType: 'image/png',
                },
                referenceType: 'ASSET' as any,
            }));

            operation = await ai.models.generateVideos({
                model: 'veo-3.1-generate-preview', // Must be this model
                prompt: config.prompt,
                config: {
                    numberOfVideos: 1,
                    resolution: '720p', // Must be 720p
                    aspectRatio: config.aspectRatio, // Use user selected aspect ratio (e.g. 9:16)
                    referenceImages: referenceImagesPayload,
                }
            });
        }
        // 3. STANDARD GENERATION MODE (Text-to-Video or Image-to-Video)
        else {
            if (config.imageStart) {
                onProgress?.("Processing start frame...");
            } else if (config.imageEnd) {
                onProgress?.("Processing end frame...");
            } else {
                onProgress?.("Processing text prompt...");
            }

            const generationConfig: any = {
                numberOfVideos: 1,
                resolution: config.resolution,
                aspectRatio: config.aspectRatio,
            };

            if (config.imageEnd) {
                generationConfig.lastFrame = { imageBytes: config.imageEnd, mimeType: 'image/png' };
            }

            const params: any = {
                model: config.model,
                prompt: config.prompt,
                config: generationConfig
            };

            if (config.imageStart) {
                params.image = { imageBytes: config.imageStart, mimeType: 'image/png' };
            }

            operation = await ai.models.generateVideos(params);
        }

        onProgress?.("Request submitted. Generating video frames...");

        // Polling loop
        let elapsedTime = 0;
        while (!operation.done) {
            await delay(5000);
            elapsedTime += 5;
            operation = await ai.operations.getVideosOperation({ operation: operation });
            onProgress?.(`Generating video frames... (${elapsedTime}s elapsed)`);
        }

        if (operation.error) {
            throw new Error(operation.error.message);
        }
        
        onProgress?.("Finalizing video output...");

        const generatedVideo = operation.response?.generatedVideos?.[0];
        const uri = generatedVideo?.video?.uri;
        if (!uri) throw new Error("No URI returned from API");

        // Append key to URL for playback authorization
        return {
            url: `${uri}&key=${finalApiKey}`,
            videoObject: generatedVideo?.video
        };
    } catch (error: any) {
        console.error("Veo Service Error:", error);
        throw new Error(mapErrorMessage(error));
    }
}