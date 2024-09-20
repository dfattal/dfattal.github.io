const lifUrl = "../images/fluff_LIF52.jpg";
const container = document.getElementById('container');

async function main() {
    
    const response = await fetch(lifUrl);
    const blob = await response.blob();
    const file = new File([blob], 'fluff_LIF52.jpg', { type: 'image/jpeg'});
    const lifInfo = await parseLif53(file);

    const lifObj = new lifViewer(lifInfo);
    lifObj.img.src = lifUrl;
    lifObj.img.width = 300;
    container.appendChild(lifObj.img);
    lifObj.canvas.width = lifObj.img.width;
    lifObj.canvas.height = 385;
    container.appendChild(lifObj.canvas);

    // lifObj.canvas.addEventListener('mouseenter', () => lifObj.startAnimation());
    // lifObj.canvas.addEventListener('mouseleave', () => lifObj.stopAnimation());
    await lifObj.startAnimation();
   
}


// Start the main function
main();