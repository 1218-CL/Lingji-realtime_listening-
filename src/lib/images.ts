interface CompressedImage {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取这张图片"));
    };
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

/**
 * Board photos from phones are much larger than the model needs. Resize and
 * re-encode locally so uploads and vision requests stay small and fast.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件。");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("图片不能超过 25 MB。");
  }

  const source = await loadImage(file);
  const maxDimension = 1600;
  const scale = Math.min(
    1,
    maxDimension / Math.max(source.naturalWidth, source.naturalHeight),
  );
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法处理图片。");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  let blob: Blob | null = null;
  for (const quality of [0.84, 0.74, 0.64]) {
    blob = await canvasToBlob(canvas, quality);
    if (blob && blob.size <= 1.4 * 1024 * 1024) break;
  }
  if (!blob) throw new Error("图片处理失败，请换一张试试。");
  return { blob, mime: "image/jpeg", width, height };
}
