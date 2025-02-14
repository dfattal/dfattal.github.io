import cv2
import numpy as np
import matplotlib.pyplot as plt

def order_points(pts):
    """Order points as: top-left, top-right, bottom-right, bottom-left"""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # top-left
    rect[2] = pts[np.argmax(s)]  # bottom-right

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right
    rect[3] = pts[np.argmax(diff)]  # bottom-left
    return rect

def four_point_transform(image, pts):
    """Perform a perspective transform to rectify the image based on the four corners."""
    rect = order_points(pts)
    (tl, tr, br, bl) = rect

    # Compute the width and height of the new image
    widthA = np.linalg.norm(br - bl)
    widthB = np.linalg.norm(tr - tl)
    maxWidth = max(int(widthA), int(widthB))

    heightA = np.linalg.norm(tr - br)
    heightB = np.linalg.norm(tl - bl)
    maxHeight = max(int(heightA), int(heightB))

    # Destination points for the transform
    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]
    ], dtype="float32")

    # Compute the perspective transform matrix and apply it
    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
    return warped

def sRGB_to_linearRGB(image):
    """Convert sRGB image to linear RGB."""
    image = image / 255.0
    mask = image <= 0.04045
    image[mask] = image[mask] / 12.92
    image[~mask] = ((image[~mask] + 0.055) / 1.055) ** 2.4
    return image

def compute_crosstalk(image_left, image_right):
    """Compute the cross-talk for the left and right eye using linear RGB."""
    # For left eye: Cross-talk is the ratio of blue to red (blue/red).
    left_crosstalk = image_left[:, :, 0] / (image_left[:, :, 2] + 1e-6)  # Blue/Red ratio
    
    # For right eye: Cross-talk is the ratio of red to blue (red/blue).
    right_crosstalk = image_right[:, :, 2] / (image_right[:, :, 0] + 1e-6)  # Red/Blue ratio
    
    return left_crosstalk, right_crosstalk

def plot_crosstalk_map(left_crosstalk, right_crosstalk):
    """Plot the cross-talk maps for both the left and right eye."""
    fig, axes = plt.subplots(1, 2, figsize=(12, 6))
    
    # Plot the left-eye cross-talk map
    axes[0].imshow(left_crosstalk, cmap='hot', vmin=0, vmax=1)
    axes[0].set_title("Left Eye Cross-talk")
    axes[0].axis('off')
    
    # Plot the right-eye cross-talk map
    axes[1].imshow(right_crosstalk, cmap='hot', vmin=0, vmax=1)
    axes[1].set_title("Right Eye Cross-talk")
    axes[1].axis('off')
    
    plt.tight_layout()
    plt.show()

def main(left_image_path, right_image_path, red_range, blue_range, screen_resolution):
    """Main function to compute and plot cross-talk for a stereo pair."""
    # Load the images
    left_image = cv2.imread(left_image_path)
    right_image = cv2.imread(right_image_path)
    
    if left_image is None or right_image is None:
        print("Error: One or both images not found.")
        return
    
    # Convert to linear RGB (gamma correction)
    left_image_linear = sRGB_to_linearRGB(left_image)
    right_image_linear = sRGB_to_linearRGB(right_image)
    
    # Process left image (red region detection)
    hsv_left = cv2.cvtColor(left_image, cv2.COLOR_BGR2HSV)
    mask_left = cv2.inRange(hsv_left, red_range[0], red_range[1])
    contours_left, _ = cv2.findContours(mask_left, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours_left:
        print("No contours found for left image.")
        return
    
    # Select the largest contour for left image and approximate it to a polygon
    c_left = max(contours_left, key=cv2.contourArea)
    peri_left = cv2.arcLength(c_left, True)
    approx_left = cv2.approxPolyDP(c_left, 0.02 * peri_left, True)
    if len(approx_left) != 4:
        print("Could not detect four corners for left image.")
        return
    
    # Process right image (blue region detection)
    hsv_right = cv2.cvtColor(right_image, cv2.COLOR_BGR2HSV)
    mask_right = cv2.inRange(hsv_right, blue_range[0], blue_range[1])
    contours_right, _ = cv2.findContours(mask_right, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours_right:
        print("No contours found for right image.")
        return
    
    # Select the largest contour for right image and approximate it to a polygon
    c_right = max(contours_right, key=cv2.contourArea)
    peri_right = cv2.arcLength(c_right, True)
    approx_right = cv2.approxPolyDP(c_right, 0.02 * peri_right, True)
    if len(approx_right) != 4:
        print("Could not detect four corners for right image.")
        return
    
    # Rectify both images using the four point transform
    warped_left = four_point_transform(left_image_linear, approx_left.reshape(4, 2))
    warped_right = four_point_transform(right_image_linear, approx_right.reshape(4, 2))
    
    # Compute cross-talk maps for both eyes
    left_crosstalk, right_crosstalk = compute_crosstalk(warped_left, warped_right)
    
    # Plot the cross-talk maps
    plot_crosstalk_map(left_crosstalk, right_crosstalk)

if __name__ == "__main__":
    # Define red and blue ranges for HSV (adjust as needed)
    red_lower = np.array([0, 100, 100])
    red_upper = np.array([10, 255, 255])
    blue_lower = np.array([100, 50, 50])
    blue_upper = np.array([140, 255, 255])
    
    # Define the screen resolution (e.g., 1920x1080)
    screen_resolution = (1920, 1080)
    
    # Specify the file paths for the stereo images
    left_image_path = "CV/XTalkData/Red.jpg"
    right_image_path = "CV/XTalkData/Blue.jpg"
    
    # Call the main function
    main(left_image_path, right_image_path, (red_lower, red_upper), (blue_lower, blue_upper), screen_resolution)