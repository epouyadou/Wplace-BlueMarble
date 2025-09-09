
class TileProgress {
  constructor(parameters) {
    this.totalPixelCount = parameters.totalPixelCount;
    this.paintedPixelCount = parameters.paintedPixelCount;
    this.wrongPixelCount = parameters.wrongPixelCount;
    this.paintedPixelColorCounts = parameters.paintedPixelColorCounts;
    this.wrongPixelColorCounts = parameters.wrongPixelColorCounts;
    this.wrongPixelPositions = parameters.wrongPixelPositions || [];
  }
}

class TileProgressManager {
  constructor() {
    this.tileProgress = new Map();
  }

  set(tileKey, progress) {
    this.tileProgress.set(tileKey, progress);
  }

  get(tileKey) {
    return this.tileProgress.get(tileKey);
  }

  has(tileKey) {
    return this.tileProgress.has(tileKey);
  }

  computeTotalProgress() {
    let aggregateTotalPixelCount = 0;
    let aggregatePaintedPixelCount = 0;
    let aggregateWrongPixelCount = 0;
    let aggregateWrongPixelPositions = [];

    for (const progress of this.tileProgress.values()) {
      aggregateTotalPixelCount += progress.totalPixelCount;
      aggregatePaintedPixelCount += progress.paintedPixelCount;
      aggregateWrongPixelCount += progress.wrongPixelCount;
      aggregateWrongPixelPositions = aggregateWrongPixelPositions.concat(progress.wrongPixelPositions);
    }

    return {
      totalPixelCount: aggregateTotalPixelCount,
      paintedPixelCount: aggregatePaintedPixelCount,
      wrongPixelCount: aggregateWrongPixelCount,
      wrongPixelPositions: aggregateWrongPixelPositions,
    };
  }

  computeTotalColorsProgress() {
    const aggregatePaintedPixelColorCounts = {};
    const aggregateWrongPixelColorCounts = {};

    for (const progress of this.tileProgress.values()) {
      for (const [color, count] of Object.entries(progress.paintedPixelColorCounts)) {
        if (!aggregatePaintedPixelColorCounts[color]) {
          aggregatePaintedPixelColorCounts[color] = 0;
        }
        aggregatePaintedPixelColorCounts[color] += count;
      }

      for (const [color, count] of Object.entries(progress.wrongPixelColorCounts)) {
        if (!aggregateWrongPixelColorCounts[color]) {
          aggregateWrongPixelColorCounts[color] = 0;
        }
        aggregateWrongPixelColorCounts[color] += count;
      }
    }

    return {
      paintedPixelColorCounts: aggregatePaintedPixelColorCounts,
      wrongPixelColorCounts: aggregateWrongPixelColorCounts,
    };
  }
}

export { TileProgress, TileProgressManager };