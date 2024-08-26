#!/bin/bash

# Check if an input folder was provided
if [ -z "$1" ]; then
  echo "Usage: $0 /path/to/input/folder"
  exit 1
fi

# Define the input folder and output file
input_folder="$1"
output_file="$input_folder/Reel.mp4"

# Create a temporary file list for ffmpeg
file_list="file_list.txt"
rm -f $file_list  # Remove previous file list if it exists

# Generate the list of input files, checking each one for validity
for f in "$input_folder"/*.mp4; do
  if ffmpeg -v error -i "$f" -f null - 2>&1; then
    echo "file '$f'" >> $file_list
  else
    echo "Skipping invalid file: $f"
  fi
done

# Find the first MP3 file in the folder
mp3_file=$(find "$input_folder" -maxdepth 1 -type f -name "*.mp3" | head -n 1)

# Check if an MP3 file was found
if [ -z "$mp3_file" ]; then
  echo "No MP3 file found. Proceeding with a mute video."
  ffmpeg -f concat -safe 0 -i $file_list "$output_file"
else
  echo "Adding soundtrack from: $mp3_file"
  # Run ffmpeg to concatenate the files and add the MP3 soundtrack, truncating the audio to the video length
  ffmpeg -f concat -safe 0 -i $file_list -i "$mp3_file" -shortest -c:a aac -b:a 192k "$output_file"
fi

# Clean up temporary file
rm -f $file_list

echo "All valid files have been combined into $output_file"