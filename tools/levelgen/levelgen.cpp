#include <cstdio>
#include <cstring>
#include <string>

// Converts a TGA file into a JSON-format level description, for easy use in
// the game. In the TGA a black pixel means no tile; a red
// pixel indicates the starting tile, a cyan pixel (r,g,b = 0,255,255)
// indicates the end tile and a white pixel means an ordinary tile.
namespace vh {

  static const int BLUE = 0;
  static const int GREEN = 1;
  static const int RED = 2;
  static const int ALPHA = 3;

  static const int GRAY = 0;

  static const int START_VAL = 255 / 3;
  static const int END_VAL = 255 * 2 / 3;


  struct Image {
    int width, height, channels;
    unsigned char* pixels;

    Image() : width(-1), height(-1), channels(-1), pixels(0) {}
    ~Image() { delete[] pixels; }

    int at(int x, int y, int channel) const;
    int intensity(int x, int y) const;
  };


  int Image::at(int x, int y, int channel) const
  {
    int rowStride = width * channels;
    int colStride = channels;
    int idx = y * rowStride + x * colStride + channel;
    return pixels[idx];
  }


  int Image::intensity(int x, int y) const
  {
    if (channels == 1) {
      return at(x, y, GRAY);
    }
    else if (channels == 3 || channels == 4) {
      int r = at(x, y, RED);
      int g = at(x, y, GREEN);
      int b = at(x, y, BLUE);
      // ignore alpha channel
      return (r + g + b) / 3;
    }
    else {
      return -1;
    }
  }


  bool tgaLoadUncompressed(FILE *file, unsigned int numPixels, unsigned int bytesPerPixel, unsigned char *pixels)
  {
    unsigned int numBytes = numPixels * bytesPerPixel;
    if (fread(pixels, sizeof(unsigned char), numBytes, file) < numBytes) {
      fprintf(stderr, "Missing or invalid TGA image data.\n");
      return false;
    }
    return true;
  }


  bool tgaLoadRLECompressed(FILE *file, unsigned int numPixels, unsigned int bytesPerPixel, unsigned char *pixels)
  {
    const int MAX_BYTES_PER_PIXEL = 4;

    int pixelCount;
    bool isEncoded;

    unsigned int pixelsRead = 0;
    unsigned char pixel[MAX_BYTES_PER_PIXEL];
    while (pixelsRead < numPixels) {
      pixelCount = fgetc(file);
      if (pixelCount == EOF) {
        fprintf(stderr, "Missing or invalid TGA image data.\n");
        return false;
      }

      isEncoded = pixelCount > 127;
      pixelCount = (pixelCount & 0x7F) + 1;
      if (isEncoded) {
        if (fread(pixel, sizeof(unsigned char), bytesPerPixel, file) < bytesPerPixel) {
          fprintf(stderr, "Missing or invalid TGA image data.\n");
          return false;
        }
        for (int i = 0; i < pixelCount; ++i) {
          memcpy(pixels, pixel, bytesPerPixel);
          pixels += bytesPerPixel;
        }
      }
      else {
        unsigned int numBytes = pixelCount * bytesPerPixel;
        if (fread(pixels, sizeof(unsigned char), numBytes, file) < numBytes) {
          fprintf(stderr, "Missing or invalid TGA image data.\n");
          return false;
        }
        pixels += numBytes;
      }
      pixelsRead += pixelCount;
    }

    return true;
  }


  bool readTGA(FILE *file, Image& img)
  {
    unsigned char header[18];
    fread(header, sizeof(unsigned char), 18, file);
    if (header[1] != 0) { // The colormap byte.
      fprintf(stderr, "Colormap TGA files aren't supported.\n");
      return false;
    }

    img.width = header[0xC] + header[0xD] * 256; 
    img.height = header[0xE] + header[0xF] * 256;
    unsigned int bitDepth = header[0x10];
    /* make sure we are loading a supported bit-depth */
    if (bitDepth != 32 && bitDepth != 24 && bitDepth != 8) {
      fprintf(stderr, "TGA files with a bit depth of %d aren't supported.\n", bitDepth);
      return false;
    }

    unsigned int numPixels = img.width * img.height;
    img.channels = bitDepth / 8;
    img.pixels = new unsigned char[numPixels * img.channels];
    switch (header[2]) { // The image type byte
    case 2: // TrueColor, uncompressed
    case 3: // Monochrome, uncompressed
      return tgaLoadUncompressed(file, numPixels, img.channels, img.pixels);
    case 10: // TrueColor, RLE compressed
    case 11: // Monochrome, RLE compressed
      return tgaLoadRLECompressed(file, numPixels, img.channels, img.pixels);
      // Unsupported image types.
    default:
      fprintf(stderr, "Unknown TGA image type (type code: %d\n).", header[2]);
      return false;
    }
  }


  std::string basename(const std::string& filename)
  {
    size_t start = filename.find_last_of("/\\");
    if (start == std::string::npos)
      start = 0;
    else
      start++;

    size_t end = filename.rfind(".");
    size_t count;
    if (end != std::string::npos)
      count = end - start;
    else
      count = end;

    return filename.substr(start, count);
  }


  bool writeLevel(const Image& img, const std::string& name, FILE* file)
  {
    int startIdx = -1, startCount = 0;
    int endIdx = -1, endCount = 0;
    int activeTileCount = 0;

    int numPixels = img.width * img.height * img.channels;
    for (int i = 0; i < numPixels; i += img.channels) {
      int val = img.pixels[i] + img.pixels[i + 1] + img.pixels[i + 2];
      if (val == 255) {
        startIdx = i / 3;
        startCount++;
      }
      else if (val == 255 * 2) {
        endIdx = i / 3;
        endCount++;
      }
      else if (val == 255 * 3) {
        activeTileCount++;
      }
    }

    if (startCount != 1)
      return false;

    if (endCount != 1)
      return false;

    int startRow = startIdx / img.width;
    int startCol = startIdx % img.width;
    int endRow = endIdx / img.width;
    int endCol = endIdx % img.width;

    std::string levelName = basename(name);

    fprintf(file, "  {\n");
    fprintf(file, "    'name': '%s'\n", levelName.c_str());
    fprintf(file, "    'rows': %d,\n", img.height);
    fprintf(file, "    'cols': %d,\n", img.width);
    fprintf(file, "    'tiles': [\n");
    for (int y = 0; y < img.height; ++y) {
      fprintf(file, "      [");
      for (int x = 0; x < img.width; ++x) {
        int val = img.intensity(x, y);
        if (val != 0)
          val = 1;
        fprintf(file, " %d,", val);
      }
      fprintf(file, " ],\n");
    }
    fprintf(file, "    ],\n");
    fprintf(file, "    'startTile': { 'row': %d, 'col': %d },\n", startRow, startCol);
    fprintf(file, "    'endTile': { 'row': %d, 'col': %d },\n", endRow, endCol);
    fprintf(file, "    'width': null,\n");
    fprintf(file, "    'depth': null,\n");
    fprintf(file, "  },\n");

    return true;
  }


  bool process(FILE* jsonfile, const char* imgpath)
  {
    vh::Image img;

    FILE* imgfile = fopen(imgpath, "rb");
    if (!imgfile) {
      fprintf(stderr, "Couldn't open %s. Skipping.\n", imgpath);
      return false;
    }

    if (!vh::readTGA(imgfile, img)) {
      fprintf(stderr, "Error reading TGA %s. Skipping.\n", imgpath);
      fclose(imgfile);
      return false;
    }

    fclose(imgfile);

    vh::writeLevel(img, imgpath, jsonfile);
    fflush(jsonfile);
    return true;
  }

} // namespace vh


int main(int argc, char** argv)
{
  if (argc < 3) {
    fprintf(stderr, "Usage: %s <level-json-file> <tga-file-1> [ <tga-file-2> ... ]\n", argv[0]);
    return 1;
  }

  FILE* jsonfile = 0;
  int processed = 0, skipped = 0;

  if (strcmp(argv[1], "-") == 0)
    jsonfile = stdout;
  else
    jsonfile = fopen(argv[1], "w");

  if (!jsonfile) {
    fprintf(stderr, "Couldn't open %s\n", argv[2]);
    return 1;
  }

  fprintf(jsonfile, "var levels = [\n");
  for (int i = 2; i < argc; i++) {
    if (!vh::process(jsonfile, argv[i]))
      ++skipped;
    else
      ++processed;
  }
  fprintf(jsonfile, "];\n");

  if (jsonfile != stdout)
    fclose(jsonfile);

  fprintf(stderr, "%d files: %d processed, %d skipped\n", (processed + skipped), processed, skipped);
  return 0;
}

