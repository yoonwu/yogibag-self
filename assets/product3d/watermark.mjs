export const WATERMARK_TEXT = '요기에코백';

// Screen coordinates keep the mark legible while rotating or zooming the bag.
// This layer is drawn only on resize, so it adds no work to the WebGL frames.
export function drawWatermark(context, width, height) {
  context.clearRect(0, 0, width, height);
  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 26px "Noto Sans KR", "Malgun Gothic", sans-serif';
  context.fillStyle = 'rgba(65, 72, 80, 0.15)';
  context.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  context.lineWidth = 2;
  for (let y = 95, row = 0; y < height + 100; y += 190, row++) {
    for (let x = row % 2 ? 50 : 190; x < width + 130; x += 330) {
      context.save();
      context.translate(x, y);
      context.rotate(-Math.PI / 8);
      context.strokeText(WATERMARK_TEXT, 0, 0);
      context.fillText(WATERMARK_TEXT, 0, 0);
      context.restore();
    }
  }
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
