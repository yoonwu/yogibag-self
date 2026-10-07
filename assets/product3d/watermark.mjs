export const WATERMARK_TEXT = '요기에코백';

// Screen coordinates keep the mark legible while rotating or zooming the bag.
// This layer is drawn only on resize, so it adds no work to the WebGL frames.
export function drawWatermark(context, width, height) {
  context.clearRect(0, 0, width, height);
  context.save();
  context.textAlign = 'right';
  context.textBaseline = 'bottom';
  context.font = '500 14px "Noto Sans KR", "Malgun Gothic", sans-serif';
  context.fillStyle = 'rgba(65, 72, 80, 0.32)';
  context.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  context.lineWidth = 2;
  context.strokeText(WATERMARK_TEXT, width - 18, height - 16);
  context.fillText(WATERMARK_TEXT, width - 18, height - 16);
  context.restore();
}

export function captureWithWatermark(source, watermark) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  context.drawImage(source, 0, 0);
  context.drawImage(watermark, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
