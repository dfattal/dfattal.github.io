// Key constants for character movement
export const W = 'w';
export const A = 'a';
export const S = 's';
export const D = 'd';
export const SHIFT = 'shift';
export const SPACE = ' ';
export const DIRECTIONS = [W, A, S, D];

/**
 * KeyDisplay - Visual on-screen keyboard display
 * Shows which movement keys are currently pressed
 */
export class KeyDisplay {
    map = new Map();

    constructor() {
        const w = this.createKeyDiv(W);
        const a = this.createKeyDiv(A);
        const s = this.createKeyDiv(S);
        const d = this.createKeyDiv(D);
        const shift = this.createKeyDiv(SHIFT);
        const space = this.createKeyDiv('SPACE');

        this.map.set(W, w);
        this.map.set(A, a);
        this.map.set(S, s);
        this.map.set(D, d);
        this.map.set(SHIFT, shift);
        this.map.set(SPACE, space);

        document.body.appendChild(w);
        document.body.appendChild(a);
        document.body.appendChild(s);
        document.body.appendChild(d);
        document.body.appendChild(shift);
        document.body.appendChild(space);

        this.updatePosition();
    }

    /**
     * Create a key display div element
     */
    createKeyDiv(key) {
        const div = document.createElement('div');
        div.style.color = 'blue';
        div.style.fontSize = '50px';
        div.style.fontWeight = '800';
        div.style.position = 'absolute';
        div.textContent = key.toUpperCase();
        return div;
    }

    /**
     * Update positions of key displays on screen
     */
    updatePosition() {
        this.map.get(W).style.top = `${window.innerHeight - 150}px`;
        this.map.get(W).style.left = `${300}px`;

        this.map.get(A).style.top = `${window.innerHeight - 100}px`;
        this.map.get(A).style.left = `${250}px`;

        this.map.get(S).style.top = `${window.innerHeight - 100}px`;
        this.map.get(S).style.left = `${300}px`;

        this.map.get(D).style.top = `${window.innerHeight - 100}px`;
        this.map.get(D).style.left = `${350}px`;

        this.map.get(SHIFT).style.top = `${window.innerHeight - 100}px`;
        this.map.get(SHIFT).style.left = `${50}px`;

        this.map.get(SPACE).style.top = `${window.innerHeight - 100}px`;
        this.map.get(SPACE).style.left = `${450}px`;
    }

    /**
     * Visual feedback when key is pressed
     */
    down(key) {
        if (this.map.get(key.toLowerCase())) {
            this.map.get(key.toLowerCase()).style.color = 'red';
        }
    }

    /**
     * Visual feedback when key is released
     */
    up(key) {
        if (this.map.get(key.toLowerCase())) {
            this.map.get(key.toLowerCase()).style.color = 'blue';
        }
    }
}
