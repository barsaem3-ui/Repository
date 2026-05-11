
const http = require('http');
http.get('http://localhost:3000/search?q=' + encodeURIComponent('보관가방 < 구형 >'), (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const results = JSON.parse(data);
        console.log(results);
    });
});

