
import TemplateTileBlob from "./TemplateTileBlob";

export default class TemplateArray {
  constructor(templates) {
    this.templates = templates;
    console.log(this.templates);
  }

  sortByPriority() {
    this.templates.sort((a, b) => {return a.sortID - b.sortID;});
    console.log(this.templates);
  }

  isAnyTemplateInTile(tileCoords) {
    return this.templates.some(template => {
      if (!template?.chunked) { return false; }

      // Fast path via recorded tile prefixes if available
      if (template.tilePrefixes && template.tilePrefixes.size > 0) {
        return template.tilePrefixes.has(tileCoords);
      }

      // Fallback: scan chunked keys
      return Object.keys(template.chunked).some(k => k.startsWith(tileCoords));
    });
  }

  getRelevantTemplateTileBlobs(tileCoords) {
    return this.templates
      .map(template => {
        const matchingTiles = Object.keys(template.chunked).filter(tile =>
          tile.startsWith(tileCoords)
        );

        if (matchingTiles.length === 0) {return null;} // Return null when nothing is found

        // Retrieves the blobs of the templates for this tile
        const matchingTileBlobs = matchingTiles.map(tile => {

          const coords = tile.split(','); // [x, y, x, y] Tile/pixel coordinates

          return new TemplateTileBlob({
            bitmap: template.chunked[tile],
            tileCoords: [coords[0], coords[1]],
            pixelCoords: [coords[2], coords[3]]
          });
        });

        return matchingTileBlobs?.[0];
      })
    .filter(Boolean);
  }
}

