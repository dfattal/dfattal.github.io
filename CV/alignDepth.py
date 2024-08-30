# %% [markdown]
# # Depth Map Alignment and Blending
# 
# This notebook demonstrates how to align and blend an outpainted depth map with the original depth map to ensure continuity and smooth transitions. The process involves global brightness/contrast adjustment, translation correction, and bilateral filtering.

# %% 
from PIL import Image
import numpy as np
import cv2
import matplotlib.pyplot as plt

# %% [markdown]
# ## Load Images
# Load the original and outpainted depth maps using the `PIL` library and convert them to grayscale.

# %%
original_depth_map_path = "/mnt/data/lady_disparity.png"
outpainted_depth_map_path = "/mnt/data/lady_outpainted_0-20_disparity.png"

original_depth_map = Image.open(original_depth_map_path).convert("L")
outpainted_depth_map = Image.open(outpainted_depth_map_path).convert("L")

# %% [markdown]
# ## Convert Images to Numpy Arrays
# Convert the loaded images into numpy arrays for processing.

# %%
original_depth_map_np = np.array(original_depth_map)
outpainted_depth_map_np = np.array(outpainted_depth_map)

# Display the original and outpainted depth maps
plt.figure(figsize=(12, 6))
plt.subplot(1, 2, 1)
plt.title("Original Depth Map")
plt.imshow(original_depth_map_np, cmap="gray")
plt.subplot(1, 2, 2)
plt.title("Outpainted Depth Map")
plt.imshow(outpainted_depth_map_np, cmap="gray")
plt.show()

# %% [markdown]
# ## Step 1: Global Brightness/Contrast Adjustment
# Adjust the brightness and contrast of the outpainted depth map using histogram matching to better match the original depth map.

# %%
original_hist, bins = np.histogram(original_depth_map_np.flatten(), 256, [0,256])
cdf_original = original_hist.cumsum()
cdf_original_normalized = cdf_original * float(original_hist.max()) / cdf_original.max()

outpainted_hist, bins = np.histogram(outpainted_depth_map_np.flatten(), 256, [0,256])
cdf_outpainted = outpainted_hist.cumsum()
cdf_outpainted_normalized = cdf_outpainted * float(outpainted_hist.max()) / cdf_outpainted.max()

cdf_m = np.ma.masked_equal(cdf_outpainted, 0)
cdf_m = (cdf_m - cdf_m.min()) * 255 / (cdf_m.max() - cdf_m.min())
cdf = np.ma.filled(cdf_m, 0).astype('uint8')

outpainted_depth_map_matched = cdf[outpainted_depth_map_np]

# Display the brightness/contrast adjusted outpainted depth map
plt.figure(figsize=(6, 6))
plt.title("Outpainted Depth Map after Brightness/Contrast Adjustment")
plt.imshow(outpainted_depth_map_matched, cmap="gray")
plt.show()

# %% [markdown]
# ## Step 2: Translation Adjustment
# Correct any minor misalignment between the original and outpainted depth maps using template matching.

# %%
res = cv2.matchTemplate(outpainted_depth_map_matched, original_depth_map_np, cv2.TM_CCOEFF_NORMED)
_, _, _, max_loc = cv2.minMaxLoc(res)

# Determine translation offsets
top_left = max_loc
height_original, width_original = original_depth_map_np.shape
height_outpainted, width_outpainted = outpainted_depth_map_matched.shape

# Create a blank canvas for the translated depth map
translated_outpainted_depth_map = np.zeros_like(outpainted_depth_map_matched)
translated_outpainted_depth_map[top_left[1]:top_left[1]+height_original, top_left[0]:top_left[0]+width_original] = original_depth_map_np

# Display the translated outpainted depth map
plt.figure(figsize=(6, 6))
plt.title("Outpainted Depth Map after Translation Adjustment")
plt.imshow(translated_outpainted_depth_map, cmap="gray")
plt.show()

# %% [markdown]
# ## Step 3: Bilateral Filtering
# Apply bilateral filtering to the translated outpainted depth map to smooth the transitions between the original and outpainted regions.

# %%
filtered_outpainted_depth_map = cv2.bilateralFilter(translated_outpainted_depth_map, d=9, sigmaColor=75, sigmaSpace=75)

# Display the filtered outpainted depth map
plt.figure(figsize=(6, 6))
plt.title("Outpainted Depth Map after Bilateral Filtering")
plt.imshow(filtered_outpainted_depth_map, cmap="gray")
plt.show()

# %% [markdown]
# ## Step 4: Combine the Original and Filtered Depth Maps
# Combine the original depth map with the filtered outpainted depth map, ensuring that the original depth map is preserved in the center.

# %%
# Insert the original depth map into the center of the filtered outpainted map
center_y = (height_outpainted - height_original) // 2
center_x = (width_outpainted - width_original) // 2
filtered_outpainted_depth_map[center_y:center_y+height_original, center_x:center_x+width_original] = original_depth_map_np

# Display the final combined depth map
plt.figure(figsize=(6, 6))
plt.title("Final Combined Depth Map")
plt.imshow(filtered_outpainted_depth_map, cmap="gray")
plt.show()

# %% [markdown]
# ## Save the Final Depth Map
# Convert the final combined depth map to an image and save it.

# %%
final_depth_map_image = Image.fromarray(filtered_outpainted_depth_map.astype(np.uint8))
final_depth_map_image_path = "/mnt/data/final_depth_map.png"
final_depth_map_image.save(final_depth_map_image_path)

# %% [markdown]
