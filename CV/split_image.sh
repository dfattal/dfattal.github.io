#!/bin/bash

# Check if the user has provided an input filename
if [ -z "$1" ]; then
  echo "Usage: $0 <input_image>"
  exit 1
fi

# Input image (taken from the command line argument)
input_image="$1"

# Get the directory and base name of the input image
input_dir=$(dirname "$input_image")
input_filename=$(basename "$input_image")
base_name="${input_filename%.*}"

# Get the width and height of the image
width=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$input_image")
height=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$input_image")

# Calculate half of the width and height
half_width=$((width / 2))
half_height=$((height / 2))

# Top-left quadrant
ffmpeg -i "$input_image" -vf "crop=${half_width}:${half_height}:0:0" "${input_dir}/${base_name}_top_left.jpg"

# Top-right quadrant
ffmpeg -i "$input_image" -vf "crop=${half_width}:${half_height}:${half_width}:0" "${input_dir}/${base_name}_top_right.jpg"

# Bottom-left quadrant
ffmpeg -i "$input_image" -vf "crop=${half_width}:${half_height}:0:${half_height}" "${input_dir}/${base_name}_bottom_left.jpg"

# Bottom-right quadrant
ffmpeg -i "$input_image" -vf "crop=${half_width}:${half_height}:${half_width}:${half_height}" "${input_dir}/${base_name}_bottom_right.jpg"

echo "Images saved to $input_dir"