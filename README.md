# file-splitter

CLI tool to split large files into smaller chunks.

## Requirements

- Node.js (latest LTS recommended)
- ffmpeg + ffprobe available on PATH (required for MP3 splitting and MP3 tests)

Install on macOS with Homebrew:

```
brew install ffmpeg
```

## Usage

```
file-splitter txt <input> --out <dir> --max <value> --by bytes|characters|lines [--paragraphs] [--headers] [--header-template <template>]
file-splitter mp3 <input> --out <dir> --max <value> --by bytes|minutes
file-splitter mp3 <input> --out <dir> --respect-silence <seconds>
```

### TXT examples

Split by characters:

```
file-splitter txt ./notes.txt --out ./chunks --max 1000 --by characters
```

Split by lines, preserving paragraphs:

```
file-splitter txt ./notes.txt --out ./chunks --max 50 --by lines --paragraphs
```

Add headers with a custom template:

```
file-splitter txt ./notes.txt --out ./chunks --max 2000 --by bytes --headers --header-template "Part {index}/{total}\n"
```

### MP3 examples

Split by minutes (max duration per chunk):

```
file-splitter mp3 ./audio.mp3 --out ./chunks --max 5 --by minutes
```

Split by bytes (approximate):

```
file-splitter mp3 ./audio.mp3 --out ./chunks --max 5000000 --by bytes
```

Split on silence (min silence seconds):

```
file-splitter mp3 ./audio.mp3 --out ./chunks --respect-silence 0.5
```

## Output Naming

Chunks are written as:

```
original_filename_00001.ext
original_filename_00002.ext
```

## Development

```
npm install
npm test
```
