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

    constructor(isMobile = false) {
        console.log('KeyDisplay: isMobile =', isMobile);

        const w = this.createKeyDiv(W, isMobile);
        const a = this.createKeyDiv(A, isMobile);
        const s = this.createKeyDiv(S, isMobile);
        const d = this.createKeyDiv(D, isMobile);
        const shift = this.createKeyDiv(SHIFT, isMobile);
        const space = this.createKeyDiv('SPACE', isMobile);

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
     * Create a key display div element styled like a keyboard key
     */
    createKeyDiv(key, isMobile = false) {
        const div = document.createElement('div');

        // Keyboard key styling
        div.style.position = 'absolute';
        div.style.padding = '8px 12px';
        div.style.minWidth = '40px';
        div.style.textAlign = 'center';
        div.style.fontFamily = "'Courier New', monospace";
        div.style.fontSize = '16px';
        div.style.fontWeight = 'bold';
        div.style.color = '#333';
        div.style.background = 'linear-gradient(180deg, #f0f0f0, #d0d0d0)';
        div.style.border = '1px solid #999';
        div.style.borderRadius = '4px';
        div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5)';
        div.style.transition = 'all 0.1s ease';
        div.style.userSelect = 'none';
        div.style.opacity = '0.6';
        div.textContent = key.toUpperCase();

        // Hide on mobile devices
        if (isMobile) {
            div.style.display = 'none';
        }

        return div;
    }

    /**
     * Update positions of key displays on screen
     * Arranged in a tight keyboard-style layout: SHIFT and SPACE symmetric around WASD
     */
    updatePosition() {
        const bottomOffset = 80;   // Distance from bottom
        const keyWidth = 64;       // Actual rendered width (40px minWidth + 24px padding)
        const keyGap = 4;          // Tight gap between keys
        const rowHeight = 45;      // Height between rows
        const sideGap = 15;        // Gap between WASD cluster and SHIFT/SPACE

        // WASD cluster centered
        const wasdStartX = 100;

        // W key (top row, centered above S)
        this.map.get(W).style.top = `${window.innerHeight - bottomOffset - rowHeight}px`;
        this.map.get(W).style.left = `${wasdStartX + keyWidth + keyGap}px`;

        // Bottom row: A, S, D
        this.map.get(A).style.top = `${window.innerHeight - bottomOffset}px`;
        this.map.get(A).style.left = `${wasdStartX}px`;

        this.map.get(S).style.top = `${window.innerHeight - bottomOffset}px`;
        this.map.get(S).style.left = `${wasdStartX + keyWidth + keyGap}px`;

        this.map.get(D).style.top = `${window.innerHeight - bottomOffset}px`;
        this.map.get(D).style.left = `${wasdStartX + (keyWidth + keyGap) * 2}px`;

        // SHIFT - symmetric on the left
        this.map.get(SHIFT).style.top = `${window.innerHeight - bottomOffset}px`;
        this.map.get(SHIFT).style.left = `${wasdStartX - keyWidth - sideGap}px`;

        // SPACE - symmetric on the right
        this.map.get(SPACE).style.top = `${window.innerHeight - bottomOffset}px`;
        this.map.get(SPACE).style.left = `${wasdStartX + (keyWidth + keyGap) * 3 + sideGap}px`;
    }

    /**
     * Visual feedback when key is pressed (key pressed down effect)
     */
    down(key) {
        const div = this.map.get(key.toLowerCase());
        if (div) {
            div.style.background = 'linear-gradient(180deg, #00ff00, #00cc00)';
            div.style.color = '#000';
            div.style.boxShadow = '0 1px 2px rgba(0,0,0,0.3), inset 0 2px 4px rgba(0,0,0,0.2)';
            div.style.transform = 'translateY(2px)';
            div.style.opacity = '1';
        }
    }

    /**
     * Visual feedback when key is released (key released effect)
     */
    up(key) {
        const div = this.map.get(key.toLowerCase());
        if (div) {
            div.style.background = 'linear-gradient(180deg, #f0f0f0, #d0d0d0)';
            div.style.color = '#333';
            div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5)';
            div.style.transform = 'translateY(0)';
            div.style.opacity = '0.6';
        }
    }
}
