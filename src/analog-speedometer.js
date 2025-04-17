export class AnalogSpeedometer {
    constructor() {
        this.container = document.createElement('div');
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.setupUI();
        // Don't append to document in constructor
    }

    setupUI() {
        // Container styling
        this.container.style.position = 'fixed';
        this.container.style.bottom = '20px';
        this.container.style.right = '20px';
        this.container.style.width = '240px';
        this.container.style.height = '240px';
        this.container.style.zIndex = '1000';
        this.container.style.display = 'none'; // Start hidden

        // Canvas setup
        this.canvas.width = 240;
        this.canvas.height = 240;
        this.container.appendChild(this.canvas);

        // Initial render
        this.render(0, 'N');
    }

    show() {
        if (!document.body.contains(this.container)) {
            document.body.appendChild(this.container);
        }
        this.container.style.display = 'flex';
    }

    hide() {
        if (document.body.contains(this.container)) {
            this.container.style.display = 'none';
        }
    }

    render(speed, gear) {
        const ctx = this.ctx;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = 108;

        // Clear canvas
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw dark background circle (covering entire speedometer)
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fill();

        // Draw outer circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(30, 30, 30, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw speed markings
        const speedMarkings = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300];
        const startAngle = Math.PI * 0.7;  // Start angle (where 0 km/h is) - rotated 90 degrees left
        const endAngle = Math.PI * 2.3;    // End angle (where 300 km/h is) - rotated 90 degrees left
        const angleRange = endAngle - startAngle;

        speedMarkings.forEach((mark, index) => {
            // Calculate angle for each speed marker
            const speedRatio = mark / 300; // Normalize speed to 0-1 range
            const angle = startAngle + (angleRange * speedRatio);
            
            const x1 = centerX + (radius - 16) * Math.cos(angle);
            const y1 = centerY + (radius - 16) * Math.sin(angle);
            const x2 = centerX + (radius - 6) * Math.cos(angle);
            const y2 = centerY + (radius - 6) * Math.sin(angle);

            // Draw tick mark
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw speed number
            ctx.font = '13px Arial';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const textX = centerX + (radius - 28) * Math.cos(angle);
            const textY = centerY + (radius - 28) * Math.sin(angle);
            ctx.fillText(mark.toString(), textX, textY);
        });

        // Draw needle
        const maxSpeed = 300;
        // Calculate the angle for the needle based on current speed
        const speedRatio = Math.min(Math.max(speed || 0, 0), maxSpeed) / maxSpeed;
        // Calculate angle for clockwise movement from current position
        const speedAngle = startAngle + (angleRange * speedRatio) + (Math.PI / 2);
        const needleLength = radius - 20;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(speed === 0 ? startAngle + (Math.PI / 2) : speedAngle);

        // Draw needle base
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.fill();

        // Draw needle
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -needleLength);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();

        // Draw gear indicator
        ctx.font = '26px Arial';
        ctx.fillStyle = this.getGearColor(gear);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(gear || 'N', centerX, centerY + 36);
    }

    getGearColor(gear) {
        switch (gear) {
            case 'R':
                return '#ff4444'; // Red for reverse
            case 'N':
                return '#ffff44'; // Yellow for neutral
            default:
                return '#ffffff'; // White for other gears
        }
    }

    update(speed, gear) {
        // Ensure speed is a valid number
        const validSpeed = typeof speed === 'number' ? speed : 0;
        // Ensure gear is a valid string
        const validGear = typeof gear === 'string' ? gear : 'N';
        this.render(validSpeed, validGear);
    }
} 