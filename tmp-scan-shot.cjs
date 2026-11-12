const fs = require('fs');
const { PNG } = require('pngjs');

const scan = (file) => {
    const png = PNG.sync.read(fs.readFileSync(file));
    const rows = [];
    for (let y = 0; y < png.height; y += 1) {
        let blue = 0;
        let white = 0;
        for (let x = 0; x < png.width; x += 1) {
            const i = (png.width * y + x) << 2;
            const r = png.data[i];
            const g = png.data[i + 1];
            const b = png.data[i + 2];
            if (r < 100 && g < 100 && b > 150) blue += 1;
            if (r > 240 && g > 240 && b > 240) white += 1;
        }
        rows.push({ y, blue, white });
    }
    const bands = (key) => {
        const out = [];
        let cur = null;
        for (const row of rows) {
            if (row[key] > 3) {
                if (!cur) cur = { from: row.y, to: row.y, sum: row[key] };
                else { cur.to = row.y; cur.sum += row[key]; }
            } else if (cur) { out.push(cur); cur = null; }
        }
        if (cur) out.push(cur);
        return out;
    };
    return { size: `${png.width}x${png.height}`, blue: bands('blue'), white: bands('white') };
};

for (const file of process.argv.slice(2)) {
    console.log(file);
    console.log(JSON.stringify(scan(file)));
}
