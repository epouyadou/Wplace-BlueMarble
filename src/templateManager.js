import Template from "./Template";
import { TileProgress, TileProgressManager } from "./TileProgress";
import Pixel from "./Pixel";
import TemplateArray from "./TemplateArray";
import { base64ToUint8, consoleLog, formatTileCoords, numberToEncoded } from "./utils";

/** Manages the template system.
 * This class handles all external requests for template modification, creation, and analysis.
 * It serves as the central coordinator between template instances and the user interface.
 * @class TemplateManager
 * @since 0.55.8
 * @example
 * // JSON structure for a template
 * {
 *   "whoami": "BlueMarble",
 *   "scriptVersion": "1.13.0",
 *   "schemaVersion": "2.1.0",
 *   "templates": {
 *     "0 $Z": {
 *       "name": "My Template",
 *       "enabled": true,
 *       "tiles": {
 *         "1231,0047,183,593": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA",
 *         "1231,0048,183,000": "data:image/png;AAAFCAYAAACNbyblAAAAHElEQVQI12P4"
 *       }
 *     },
 *     "1 $Z": {
 *       "name": "My Template",
 *       "URL": "https://github.com/SwingTheVine/Wplace-BlueMarble/blob/main/dist/assets/Favicon.png",
 *       "URLType": "template",
 *       "enabled": false,
 *       "tiles": {
 *         "375,1846,276,188": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA",
 *         "376,1846,000,188": "data:image/png;AAAFCAYAAACNbyblAAAAHElEQVQI12P4"
 *       }
 *     }
 *   }
 * }
 */
export default class TemplateManager {

  /** The constructor for the {@link TemplateManager} class.
   * @since 0.55.8
   */
  constructor(name, version, overlay) {

    // Meta
    this.name = name; // Name of userscript
    this.version = version; // Version of userscript
    this.overlay = overlay; // The main instance of the Overlay class
    this.templatesVersion = '1.0.0'; // Version of JSON schema
    this.userID = null; // The ID of the current user
    this.encodingBase = '!#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~'; // Characters to use for encoding/decoding
    this.tileSize = 1000; // The number of pixels in a tile. Assumes the tile is square
    this.drawMult = 3; // The enlarged size for each pixel. E.g. when "3", a 1x1 pixel becomes a 1x1 pixel inside a 3x3 area. MUST BE ODD
    
    // Template
    this.canvasTemplate = null; // Our canvas
    this.canvasTemplateZoomed = null; // The template when zoomed out
    this.canvasTemplateID = 'bm-canvas'; // Our canvas ID
    this.canvasMainID = 'div#map canvas.maplibregl-canvas'; // The selector for the main canvas
    this.template = null; // The template image.
    this.templateState = ''; // The state of the template ('blob', 'proccessing', 'template', etc.)
    this.templatesArray = []; // All Template instnaces currently loaded (Template)
    this.templatesJSON = null; // All templates currently loaded (JSON)
    this.templatesShouldBeDrawn = true; // Should ALL templates be drawn to the canvas?
    this.tileProgress = new TileProgressManager(); // Tracks per-tile progress stats {painted, required, wrong}
  }

  /** Retrieves the pixel art canvas.
   * If the canvas has been updated/replaced, it retrieves the new one.
   * @param {string} selector - The CSS selector to use to find the canvas.
   * @returns {HTMLCanvasElement|null} The canvas as an HTML Canvas Element, or null if the canvas does not exist
   * @since 0.58.3
   * @deprecated Not in use since 0.63.25
   */
  /* @__PURE__ */getCanvas() {

    // If the stored canvas is "fresh", return the stored canvas
    if (document.body.contains(this.canvasTemplate)) {return this.canvasTemplate;}
    // Else, the stored canvas is "stale", get the canvas again

    // Attempt to find and destroy the "stale" canvas
    document.getElementById(this.canvasTemplateID)?.remove(); 

    const canvasMain = document.querySelector(this.canvasMainID);

    const canvasTemplateNew = document.createElement('canvas');
    canvasTemplateNew.id = this.canvasTemplateID;
    canvasTemplateNew.className = 'maplibregl-canvas';
    canvasTemplateNew.style.position = 'absolute';
    canvasTemplateNew.style.top = '0';
    canvasTemplateNew.style.left = '0';
    canvasTemplateNew.style.height = `${canvasMain?.clientHeight * (window.devicePixelRatio || 1)}px`;
    canvasTemplateNew.style.width = `${canvasMain?.clientWidth * (window.devicePixelRatio || 1)}px`;
    canvasTemplateNew.height = canvasMain?.clientHeight * (window.devicePixelRatio || 1);
    canvasTemplateNew.width = canvasMain?.clientWidth * (window.devicePixelRatio || 1);
    canvasTemplateNew.style.zIndex = '8999';
    canvasTemplateNew.style.pointerEvents = 'none';
    canvasMain?.parentElement?.appendChild(canvasTemplateNew); // Append the newCanvas as a child of the parent of the main canvas
    this.canvasTemplate = canvasTemplateNew; // Store the new canvas

    window.addEventListener('move', this.onMove);
    window.addEventListener('zoom', this.onZoom);
    window.addEventListener('resize', this.onResize);

    return this.canvasTemplate; // Return the new canvas
  }

  /** Creates the JSON object to store templates in
   * @returns {{ whoami: string, scriptVersion: string, schemaVersion: string, templates: Object }} The JSON object
   * @since 0.65.4
   */
  async createJSON() {
    return {
      "whoami": this.name.replace(' ', ''), // Name of userscript without spaces
      "scriptVersion": this.version, // Version of userscript
      "schemaVersion": this.templatesVersion, // Version of JSON schema
      "templates": {} // The templates
    };
  }

  /** Creates the template from the inputed file blob
   * @param {File} blob - The file blob to create a template from
   * @param {string} name - The display name of the template
   * @param {Array<number, number, number, number>} coords - The coordinates of the top left corner of the template
   * @since 0.65.77
   */
  async createTemplate(blob, name, coords) {

    // Creates the JSON object if it does not already exist
    if (!this.templatesJSON) {this.templatesJSON = await this.createJSON(); console.log(`Creating JSON...`);}

    this.overlay.handleDisplayStatus(`Creating template at ${coords.join(', ')}...`);

    // Creates a new template instance
    const template = new Template({
      displayName: name,
      sortID: Object.keys(this.templatesJSON.templates).length || 0,
      authorID: numberToEncoded(this.userID || 0, this.encodingBase),
      file: blob,
      coords: coords
    });
    //template.chunked = await template.createTemplateTiles(this.tileSize); // Chunks the tiles
    const { templateTiles, templateTilesBuffers } = await template.createTemplateTiles(this.tileSize); // Chunks the tiles
    template.chunked = templateTiles; // Stores the chunked tile bitmaps

    // Appends a child into the templates object
    // The child's name is the number of templates already in the list (sort order) plus the encoded player ID
    const storageKey = `${template.sortID} ${template.authorID}`;
    template.storageKey = storageKey;
    this.templatesJSON.templates[storageKey] = {
      "name": template.displayName, // Display name of template
      "coords": coords.join(', '), // The coords of the template
      "enabled": true,
      "tiles": templateTilesBuffers, // Stores the chunked tile buffers
      "palette": template.colorPalette // Persist palette and enabled flags
    };

    this.templatesArray = []; // Remove this to enable multiple templates (2/2)
    this.templatesArray.push(template); // Pushes the Template object instance to the Template Array

    // ==================== PIXEL COUNT DISPLAY SYSTEM ====================
    // Display pixel count statistics with internationalized number formatting
    // This provides immediate feedback to users about template complexity and size
    const pixelCountFormatted = new Intl.NumberFormat().format(template.pixelCount);
    this.overlay.handleDisplayStatus(`Template created at ${coords.join(', ')}! Total pixels: ${pixelCountFormatted}`);

    // Ensure color filter UI is visible when a template is created
    try {
      const colorUI = document.querySelector('#bm-contain-colorfilter');
      if (colorUI) { colorUI.style.display = ''; }
      // Deferred palette list rendering; actual DOM is built in main via helper
      window.postMessage({ source: 'blue-marble', bmEvent: 'bm-rebuild-color-list' }, '*');
    } catch (_) { /* no-op */ }

    console.log(Object.keys(this.templatesJSON.templates).length);
    console.log(this.templatesJSON);
    console.log(this.templatesArray);
    console.log(JSON.stringify(this.templatesJSON));

    await this.#storeTemplates();
  }

  /** Generates a {@link Template} class instance from the JSON object template
   */
  #loadTemplate() {

  }

  /** Stores the JSON object of the loaded templates into TamperMonkey (GreaseMonkey) storage.
   * @since 0.72.7
   */
  async #storeTemplates() {
    GM.setValue('bmTemplates', JSON.stringify(this.templatesJSON));
  }

  /** Deletes a template from the JSON object.
   * Also delete's the corrosponding {@link Template} class instance
   */
  deleteTemplate() {

  }

  /** Disables the template from view
   */
  async disableTemplate() {

    // Creates the JSON object if it does not already exist
    if (!this.templatesJSON) {this.templatesJSON = await this.createJSON(); console.log(`Creating JSON...`);}


  }

  /** Draws all templates on the specified tile.
   * This method handles the rendering of template overlays on individual tiles.
   * @param {File} tileBlob - The pixels that are placed on a tile
   * @param {Array<number>} tileCoords - The tile coordinates [x, y]
   * @since 0.65.77
   */
  async drawTemplateOnTile(tileBlob, tileCoords) {

    // Returns early if no templates should be drawn
    if (!this.templatesShouldBeDrawn) {return tileBlob;}

    const drawSize = this.tileSize * this.drawMult; // Calculate draw multiplier for scaling

    // Format tile coordinates with proper padding for consistent lookup
    tileCoords = formatTileCoords(tileCoords);
    console.log(`Searching for templates in tile: "${tileCoords}"`);

    const templatesArrayCopy = new TemplateArray(this.templatesArray);

    // Sorts the array of Template class instances. 0 = first = lowest draw priority
    templatesArrayCopy.sortByPriority();
    // Early exit if none of the active templates touch this tile
    if (!templatesArrayCopy.isAnyTemplateInTile(tileCoords))
      return tileBlob;

    // Retrieves the relavent template tile blobs
    const templateTileBlobsToDraw = templatesArrayCopy.getRelevantTemplateTileBlobs(tileCoords);
    const templateCount = templateTileBlobsToDraw?.length || 0; // Number of templates to draw on this tile
    console.log(templateTileBlobsToDraw);
    console.log(`templateCount = ${templateCount}`);

    // We'll compute per-tile painted/wrong/required counts when templates exist for this tile
    let paintedPixelCount = 0;
    let wrongPixelCount = 0;
    let totalPixelCount = 0;
    
    let paintedPixelColorCounts = {}; // Accumulates painted color counts for active template palette colors
    let wrongPixelColorCounts = {}; // Accumulates wrong color counts for active template palette colors
    let wrongPixelPositions = []; // Accumulates wrong pixel positions for active template palette colors

    const tileBitmap = await createImageBitmap(tileBlob);

    const canvas = new OffscreenCanvas(drawSize, drawSize);
    const context = canvas.getContext('2d');

    context.imageSmoothingEnabled = false; // Nearest neighbor

    // Tells the canvas to ignore anything outside of this area
    context.beginPath();
    context.rect(0, 0, drawSize, drawSize);
    context.clip();

    context.clearRect(0, 0, drawSize, drawSize); // Draws transparent background
    context.drawImage(tileBitmap, 0, 0, drawSize, drawSize);

    // Grab a snapshot of the tile pixels BEFORE we draw any template overlays
    let tilePixelsSnapshot = null;
    try {
      tilePixelsSnapshot = context.getImageData(0, 0, drawSize, drawSize).data;
    } catch (_) {
      // If reading fails for any reason, we will skip stats
    }

    // For each template in this tile, draw them.
    for (const template of templateTileBlobsToDraw) {
      console.log(`Template:`);
      console.log(template);

      const tempWidth = template.bitmap.width;
      const tempHeight = template.bitmap.height;

      // Compute stats by sampling template center pixels against tile pixels,
      // honoring color enable/disable from the active template's palette
      if (tilePixelsSnapshot) {
        try {
          const tempCanvas = new OffscreenCanvas(tempWidth, tempHeight);
          const tempContext = tempCanvas.getContext('2d', { willReadFrequently: true });
          tempContext.imageSmoothingEnabled = false;
          tempContext.clearRect(0, 0, tempWidth, tempHeight);
          tempContext.drawImage(template.bitmap, 0, 0);
          const tempImage = tempContext.getImageData(0, 0, tempWidth, tempHeight);
          const tempData = tempImage.data; // Tile Data, Template Data, or Temp Data????

          const globalOffsetX = Number(template.pixelCoords[0]) * this.drawMult;
          const globalOffsetY = Number(template.pixelCoords[1]) * this.drawMult;

          // Loops over all pixels in the template
          // Assigns each pixel a color (if center pixel)
          for (let y = 0; y < tempHeight; y++) {
            for (let x = 0; x < tempWidth; x++) {
              // Purpose: Count which pixels are painted correctly???

              // Only evaluate the center pixel of each shred block
              // Skip if not the center pixel of the shred block
              if ((x % this.drawMult) !== 1 || (y % this.drawMult) !== 1) { 
                continue; 
              }

              const gx = x + globalOffsetX;
              const gy = y + globalOffsetY;

              // IF the pixel is out of bounds of the template, OR if the pixel is outside 
              // of the tile, then skip the pixel
              if (gx < 0 || gy < 0 || gx >= drawSize || gy >= drawSize) { 
                continue; 
              }

              // shred block center pixel
              const templatePixelCenterIndex = (y * tempWidth + x) * 4;
              const shredPixel = Pixel.getFromData(tempData, templatePixelCenterIndex);

              // Possibly needs to be removed 
              // Handle template transparent pixel (alpha < 64): wrong if board has any site 
              // palette color here
              // If the alpha of the center pixel is less than 64...
              if (shredPixel.isUnpainted()) {
                try {
                  const activeTemplate = this.templatesArray?.[0];
                  const tileIdx = (gy * drawSize + gx) * 4;
                  const snapshotPixel = Pixel.getFromData(tilePixelsSnapshot, tileIdx);

                  const colorKey = snapshotPixel.getColorKey();

                  const isWPlaceColor = activeTemplate?.allowedColorsSet 
                    ? activeTemplate.allowedColorsSet.has(colorKey) 
                    : false;
                  
                  // IF the alpha of the center pixel that is placed on the canvas 
                  // is greater than or equal to 64, AND the pixel is a Wplace palette color, 
                  // then it is incorrect.
                  if (snapshotPixel.isPainted() && isWPlaceColor) {
                    wrongPixelCount++;
                    wrongPixelColorCounts[shredPixel.getColorKey()] = (wrongPixelColorCounts[shredPixel.getColorKey()] || 0) + 1;
                    wrongPixelPositions.push({ 
                      tx: Number(template.tileCoords[0]), 
                      ty: Number(template.tileCoords[1]), 
                      px: Number(template.pixelCoords[0]) + Math.floor((x - 1) / this.drawMult), 
                      py: Number(template.pixelCoords[1]) + Math.floor((y - 1) / this.drawMult),
                    });
                  }
                } catch (ignored) {}

                continue; // Continue to the next pixel
              }

              // Treat #deface as Transparent palette color (required and paintable)
              // Ignore non-palette colors (match against allowed set when available) for counting required template pixels
              // try {

              //   const activeTemplate = this.templatesArray?.[0]; // Get the first template

              //   // IF the stored palette data exists, AND the pixel is not in the allowed palette
              //   if (activeTemplate?.allowedColorsSet && !activeTemplate.allowedColorsSet.has(`${shredPixel.red},${shredPixel.green},${shredPixel.blue}`)) {

              //     continue; // Skip this pixel if it is not in the allowed palette
              //   }
              // } catch (ignored) {}

              totalPixelCount++;

              // Strict center-pixel matching. Treat transparent tile pixels as unpainted (not wrong)
              const realPixelCenterIndex = (gy * drawSize + gx) * 4;
              const realPixel = Pixel.getFromData(tilePixelsSnapshot, realPixelCenterIndex);

              // IF the pixel is painted and matches the template color
              // THEN it is painted correctly
              if (realPixel.isPainted() && realPixel.equalsRGB(shredPixel)) {
                paintedPixelCount++;
                paintedPixelColorCounts[shredPixel.getColorKey()] = (paintedPixelColorCounts[shredPixel.getColorKey()] || 0) + 1;
              } 
              // ELSE IF the pixel is painted but does not match the template color
              // THEN it is painted incorrectly
              else if (realPixel.isPainted()) {
                wrongPixelCount++;
                wrongPixelColorCounts[shredPixel.getColorKey()] = (wrongPixelColorCounts[shredPixel.getColorKey()] || 0) + 1;
                console.log(
                  `globalOffsetX = ${globalOffsetX}, globalOffsetY = ${globalOffsetY}\n` + 
                  `Template wrong pixel at (x=${x}, y=${y}) -> (gx=${gx}, gy=${gy})\n` + 
                  `drawMult=${this.drawMult}\n` + 
                  'Number(template.pixelCoords[0]) = ' + Number(template.pixelCoords[0]) + '\n' +
                  'Number(template.pixelCoords[1]) = ' + Number(template.pixelCoords[1]) + '\n' +
                  `Math.floor((x - 1) / this.drawMult) = ${Math.floor((x - 1) / this.drawMult)}\n` +
                  `Math.floor((y - 1) / this.drawMult) = ${Math.floor((y - 1) / this.drawMult)}\n`
                );
                wrongPixelPositions.push({ 
                  tx: Number(template.tileCoords[0]), 
                  ty: Number(template.tileCoords[1]), 
                  px: Number(template.pixelCoords[0]) + Math.floor((x - 1) / this.drawMult), 
                  py: Number(template.pixelCoords[1]) + Math.floor((y - 1) / this.drawMult),
                });
              }
            }
          }
        } catch (exception) {
          console.warn('Failed to compute per-tile painted/wrong stats:', exception);
        }
      }

      // Draw the template overlay for visual guidance, honoring color filter
      try {

        const activeTemplate = this.templatesArray?.[0]; // Get the first template
        const palette = activeTemplate?.colorPalette || {}; // Obtain the color palette of the template
        const hasDisabled = Object.values(palette).some(v => v?.enabled === false); // Check if any color is disabled

        // If none of the template colors are disabled, then draw the image normally
        if (!hasDisabled) {
          context.drawImage(
            template.bitmap, 
            Number(template.pixelCoords[0]) * this.drawMult, 
            Number(template.pixelCoords[1]) * this.drawMult);
        } else {
          // ELSE we need to apply the color filter

          console.log('Applying color filter...');

          const filterCanvas = new OffscreenCanvas(tempWidth, tempHeight);
          const filterCanvasCtx = filterCanvas.getContext('2d', { willReadFrequently: true });
          filterCanvasCtx.imageSmoothingEnabled = false; // Nearest neighbor
          filterCanvasCtx.clearRect(0, 0, tempWidth, tempHeight);
          filterCanvasCtx.drawImage(template.bitmap, 0, 0);

          const filterImg = filterCanvasCtx.getImageData(0, 0, tempWidth, tempHeight);
          const filterImgData = filterImg.data;

          // For every pixel...
          for (let y = 0; y < tempHeight; y++) {
            for (let x = 0; x < tempWidth; x++) {

              // If this pixel is NOT the center pixel, then skip the pixel
              if ((x % this.drawMult) !== 1 || (y % this.drawMult) !== 1) { continue; }

              const pixelIndex = (y * tempWidth + x) * 4;
              const pixel = Pixel.getFromData(filterImgData, pixelIndex);

              if (pixel.alpha < 1) { continue; }

              // Hide if color is not in allowed palette or explicitly disabled
              const inWplacePalette = activeTemplate?.allowedColorsSet 
                ? activeTemplate.allowedColorsSet.has(pixel.getColorKey()) 
                : true;

              // if (inWplacePalette) {
              //   key = 'other'; // Map all non-palette colors to "other"
              //   console.log('Added color to other');
              // }

              const isPaletteColorEnabled = 
                palette?.[inWplacePalette ? pixel.getColorKey() : 'other']?.enabled !== false;

              if (!inWplacePalette || !isPaletteColorEnabled) {
                filterImgData[pixelIndex + 3] = 0; // hide disabled color center pixel
              }
            }
          }

          // Draws the template with somes colors disabled
          filterCanvasCtx.putImageData(filterImg, 0, 0);
          context.drawImage(filterCanvas, Number(template.pixelCoords[0]) * this.drawMult, Number(template.pixelCoords[1]) * this.drawMult);
        }
      } catch (exception) {

        // If filtering fails, we can log the error or handle it accordingly
        console.warn('Failed to apply color filter:', exception);

        // Fallback to drawing raw bitmap if filtering fails
        context.drawImage(template.bitmap, Number(template.pixelCoords[0]) * this.drawMult, Number(template.pixelCoords[1]) * this.drawMult);
      }
    }

    // Save per-tile stats and compute global aggregates across all processed tiles
    if (templateCount > 0) {
      const tileKey = tileCoords; // already padded string "xxxx,yyyy"
      this.tileProgress.set(tileKey, new TileProgress({
        paintedPixelCount,
        totalPixelCount,
        wrongPixelCount,
        paintedPixelColorCounts,
        wrongPixelColorCounts,
        wrongPixelPositions
      }));

      const totalProgress = this.tileProgress.computeTotalProgress();

      // Determine total required across all templates
      // Prefer precomputed per-template required counts; fall back to sum of processed tiles
      const totalPixelCountAcrossAllTemplates = this.templatesArray.reduce(
        (sum, template) => sum + (template.requiredPixelCount || template.pixelCount || 0),
        0
      );
      const finalTotalPixelCount = totalPixelCountAcrossAllTemplates > 0 
        ? totalPixelCountAcrossAllTemplates 
        : totalProgress.totalPixelCount;

      // Turns numbers into formatted number strings. E.g., 1234 -> 1,234 OR 1.234 based on location of user
      const paintedPixelCountStr = new Intl.NumberFormat().format(totalProgress.paintedPixelCount);
      const totalPixelCountStr = new Intl.NumberFormat().format(finalTotalPixelCount);
      const requiredToPaintCountStr = new Intl.NumberFormat().format(finalTotalPixelCount - totalProgress.paintedPixelCount);
      const wrongPixelCountStr = new Intl.NumberFormat().format(totalProgress.wrongPixelCount);

      this.overlay.handleDisplayStatus(
        `Displaying ${templateCount} template${templateCount == 1 ? '' : 's'}.\n` +
        `Painted ${paintedPixelCountStr} / ${totalPixelCountStr} pixels.\n` +
        `Wrong ${wrongPixelCountStr} pixels.\n` +
        `${requiredToPaintCountStr} pixels left to paint.\n` +
        `${totalProgress.wrongPixelPositions.length > 0 ? 'Wrong pixel positions :\n' : ''}` +
        `${totalProgress.wrongPixelPositions.map(p => `Tx=${p.tx}, Ty=${p.ty}, Px=${p.px}, Py=${p.py}`).join('\n')}`
      );

      window.postMessage({ source: 'blue-marble', bmEvent: 'bm-rebuild-color-list' }, '*');
    } else {
      this.overlay.handleDisplayStatus(`Displaying ${templateCount} templates.`);
    }

    return await canvas.convertToBlob({ type: 'image/png' });
  }

  /** Imports the JSON object, and appends it to any JSON object already loaded
   * @param {string} json - The JSON string to parse
   */
  importJSON(json) {

    console.log(`Importing JSON...`);
    console.log(json);

    // If the passed in JSON is a Blue Marble template object...
    if (json?.whoami == 'BlueMarbleAE') {
      this.#parseBlueMarble(json); // ...parse the template object as Blue Marble
    }
  }

  /** Parses the Blue Marble JSON object
   * @param {string} json - The JSON string to parse
   * @since 0.72.13
   */
  async #parseBlueMarble(json) {

    console.log(`Parsing BlueMarble...`);

    const templates = json.templates;

    console.log(`BlueMarble length: ${Object.keys(templates).length}`);

    if (Object.keys(templates).length > 0) {

      for (const template in templates) {

        const templateKey = template;
        const templateValue = templates[template];
        console.log(templateKey);

        if (templates.hasOwnProperty(template)) {

          const templateKeyArray = templateKey.split(' '); // E.g., "0 $Z" -> ["0", "$Z"]
          const sortID = Number(templateKeyArray?.[0]); // Sort ID of the template
          const authorID = templateKeyArray?.[1] || '0'; // User ID of the person who exported the template
          const displayName = templateValue.name || `Template ${sortID || ''}`; // Display name of the template
          //const coords = templateValue?.coords?.split(',').map(Number); // "1,2,3,4" -> [1, 2, 3, 4]
          const tilesbase64 = templateValue.tiles;
          const templateTiles = {}; // Stores the template bitmap tiles for each tile.
          let requiredPixelCount = 0; // Global required pixel count for this imported template
          const paletteMap = new Map(); // Accumulates color counts across tiles (center pixels only)

          for (const tile in tilesbase64) {
            console.log(tile);
            if (tilesbase64.hasOwnProperty(tile)) {
              const encodedTemplateBase64 = tilesbase64[tile];
              const templateUint8Array = base64ToUint8(encodedTemplateBase64); // Base 64 -> Uint8Array

              const templateBlob = new Blob([templateUint8Array], { type: "image/png" }); // Uint8Array -> Blob
              const templateBitmap = await createImageBitmap(templateBlob) // Blob -> Bitmap
              templateTiles[tile] = templateBitmap;

              // Count required pixels in this bitmap (center pixels with alpha >= 64 and not #deface)
              try {
                const w = templateBitmap.width;
                const h = templateBitmap.height;
                const c = new OffscreenCanvas(w, h);
                const cx = c.getContext('2d', { willReadFrequently: true });
                cx.imageSmoothingEnabled = false;
                cx.clearRect(0, 0, w, h);
                cx.drawImage(templateBitmap, 0, 0);
                const data = cx.getImageData(0, 0, w, h).data;
                for (let y = 0; y < h; y++) {
                  for (let x = 0; x < w; x++) {
                    // Only count center pixels of 3x blocks
                    if ((x % this.drawMult) !== 1 || (y % this.drawMult) !== 1) { continue; }
                    const idx = (y * w + x) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = data[idx + 3];
                    if (a < 64) { continue; }
                    if (r === 222 && g === 250 && b === 206) { continue; }
                    requiredPixelCount++;
                    const key = activeTemplate.allowedColorsSet.has(`${r},${g},${b}`) ? `${r},${g},${b}` : 'other';
                    paletteMap.set(key, (paletteMap.get(key) || 0) + 1);
                  }
                }
              } catch (e) {
                console.warn('Failed to count required pixels for imported tile', e);
              }
            }
          }

          // Creates a new Template class instance
          const template = new Template({
            displayName: displayName,
            sortID: sortID || this.templatesArray?.length || 0,
            authorID: authorID || '',
            //coords: coords
          });
          template.chunked = templateTiles;
          template.requiredPixelCount = requiredPixelCount;
          // Construct colorPalette from paletteMap
          const paletteObj = {};
          for (const [key, count] of paletteMap.entries()) { paletteObj[key] = { count, enabled: true }; }
          template.colorPalette = paletteObj;
          // Populate tilePrefixes for fast-scoping
          try { Object.keys(templateTiles).forEach(k => { template.tilePrefixes?.add(k.split(',').slice(0,2).join(',')); }); } catch (_) {}
          // Merge persisted palette (enabled/disabled) if present
          try {
            const persisted = templates?.[templateKey]?.palette;
            if (persisted) {
              for (const [rgb, meta] of Object.entries(persisted)) {
                if (!template.colorPalette[rgb]) {
                  template.colorPalette[rgb] = { count: meta?.count || 0, enabled: !!meta?.enabled };
                } else {
                  template.colorPalette[rgb].enabled = !!meta?.enabled;
                }
              }
            }
          } catch (_) {}
          // Store storageKey for later writes
          template.storageKey = templateKey;
          this.templatesArray.push(template);
          console.log(this.templatesArray);
          console.log(`^^^ This ^^^`);
        }
      }
      // After importing templates from storage, reveal color UI and request palette list build
      try {
        const colorUI = document.querySelector('#bm-contain-colorfilter');
        if (colorUI) { colorUI.style.display = ''; }
        window.postMessage({ source: 'blue-marble', bmEvent: 'bm-rebuild-color-list' }, '*');
      } catch (_) { /* no-op */ }
    }
  }

  /** Parses the OSU! Place JSON object
   */
  #parseOSU() {

  }

  /** Sets the `templatesShouldBeDrawn` boolean to a value.
   * @param {boolean} value - The value to set the boolean to
   * @since 0.73.7
   */
  setTemplatesShouldBeDrawn(value) {
    this.templatesShouldBeDrawn = value;
  }
}
