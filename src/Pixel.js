
export default class Pixel {
    constructor(parameters) {
        this.red = parameters.red;
        this.green = parameters.green;
        this.blue = parameters.blue;
        this.alpha = parameters.alpha;
    }

    isPainted() {
        return this.alpha >= 64;
    }

    isUnpainted() {
        return this.alpha < 64;
    }

    static getFromData(data, index) {
        return new Pixel({
            red: data[index],
            green: data[index + 1],
            blue: data[index + 2],
            alpha: data[index + 3],
        });
    }

    getColorKey() {
        return `${this.red},${this.green},${this.blue}`;
    }

    equalsRGB(otherPixel) {
        return this.red === otherPixel.red &&
               this.green === otherPixel.green &&
               this.blue === otherPixel.blue;
    }

    equalsRGBA(otherPixel) {
        return this.red === otherPixel.red &&
               this.green === otherPixel.green &&
               this.blue === otherPixel.blue &&
               this.alpha === otherPixel.alpha;
    }
}