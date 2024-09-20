const lifUrls = ["../images/fluff_LIF52.jpg",
    "../images/fish_LIF52.jpg",
    "../images/fluff_LIF52.jpg",
    "../images/fish_LIF52.jpg",
    "../images/fluff_LIF52.jpg",
    "../images/fish_LIF52.jpg",
    "../images/fluff_LIF52.jpg",
    "../images/fish_LIF52.jpg",
    "../images/fluff_LIF52.jpg",
    "../images/fish_LIF52.jpg",
    "../images/fluff_LIF52.jpg"
];

async function main() {

    let lifObj, container;
    for (const lifUrl of lifUrls) {
        container = document.createElement('div');
        document.body.appendChild(container);
        lifObj = new lifViewer(lifUrl, container);
    }

}


// Start the main function
main();