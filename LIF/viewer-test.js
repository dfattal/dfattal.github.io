const lifUrl1 = "../images/fluff_LIF52.jpg";
const lifUrl2 = "../images/fish_LIF52.jpg";
const container1 = document.getElementById('container1');
const container2 = document.getElementById('container2');

async function main() {
    
    const response1 = await fetch(lifUrl1);
    const blob1 = await response1.blob();
    const file1 = new File([blob1], 'fluff_LIF52.jpg', { type: 'image/jpeg'});
    const lifInfo1 = await parseLif53(file1);

    const lifObj1 = new lifViewer(lifInfo1);
    lifObj1.canvas.style.display = 'none'; 
    lifObj1.img.src = lifUrl1;
    lifObj1.img.height = 300;
    lifObj1.img.onload = function() {
        container1.appendChild(lifObj1.img);
        container1.appendChild(lifObj1.canvas);
        lifObj1.resizeCanvasToContainer();
    }

    container1.addEventListener('mouseenter', () => lifObj1.startAnimation());
    container1.addEventListener('mouseleave', () => lifObj1.stopAnimation());

    const response2 = await fetch(lifUrl2);
    const blob2 = await response2.blob();
    const file2 = new File([blob2], 'fluff_LIF52.jpg', { type: 'image/jpeg'});
    const lifInfo2 = await parseLif53(file2);

    const lifObj2 = new lifViewer(lifInfo2);
    lifObj2.canvas.style.display = 'none'; 
    lifObj2.img.src = lifUrl2;
    lifObj2.img.height = 300;
    lifObj2.img.onload = function() {
        container2.appendChild(lifObj2.img);
        container2.appendChild(lifObj2.canvas);
        lifObj2.resizeCanvasToContainer();
    }

    container2.addEventListener('mouseenter', () => lifObj2.startAnimation());
    container2.addEventListener('mouseleave', () => lifObj2.stopAnimation());
   
}


// Start the main function
main();