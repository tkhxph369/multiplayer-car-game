export class Speedometer {
    constructor() {
        this.speedElement = document.createElement('div');
        this.gearElement = document.createElement('div');
        this.container = document.createElement('div');
        
        this.setupUI();
    }

    setupUI() {
        // Container styling
        this.container.style.position = 'fixed';
        this.container.style.bottom = '20px';
        this.container.style.right = '20px';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.container.style.alignItems = 'flex-end';
        this.container.style.gap = '10px';
        this.container.style.zIndex = '1000';

        // Speed display styling
        this.speedElement.style.fontFamily = 'Arial, sans-serif';
        this.speedElement.style.fontSize = '48px';
        this.speedElement.style.fontWeight = 'bold';
        this.speedElement.style.color = '#ffffff';
        this.speedElement.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
        this.speedElement.textContent = '0 km/h';

        // Gear display styling
        this.gearElement.style.fontFamily = 'Arial, sans-serif';
        this.gearElement.style.fontSize = '36px';
        this.gearElement.style.fontWeight = 'bold';
        this.gearElement.style.color = '#ffffff';
        this.gearElement.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.5)';
        this.gearElement.style.padding = '10px 20px';
        this.gearElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.gearElement.style.borderRadius = '10px';
        this.gearElement.textContent = 'N';

        // Add elements to container
        this.container.appendChild(this.speedElement);
        this.container.appendChild(this.gearElement);

        // Add container to document
        document.body.appendChild(this.container);
    }

    update(speed, gear) {
        // Update speed display
        this.speedElement.textContent = `${Math.round(speed)} km/h`;
        
        // Update gear display
        this.gearElement.textContent = gear;
        
        // Change gear color based on type
        if (gear === 'R') {
            this.gearElement.style.color = '#ff4444'; // Red for reverse
        } else if (gear === 'N') {
            this.gearElement.style.color = '#ffff44'; // Yellow for neutral
        } else {
            this.gearElement.style.color = '#ffffff'; // White for other gears
        }
    }
} 