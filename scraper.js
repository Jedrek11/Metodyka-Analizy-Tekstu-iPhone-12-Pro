const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scrapeCeneoFiles = async () => {
    const browser = await puppeteer.launch({
        headless: false, 
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();
    
    const productId = '98018295'; // iPhone 12 Pro Pacyfic Blue 128GB
    const targetReviewCount = 100; 
    
    const outputFolder = path.join('reviews', 'pl');

    if (!fs.existsSync(outputFolder)){
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    console.log(`--- Start Scrapowania Ceneo (ID: ${productId}) ---`);
    console.log(`--- Pliki trafią do: ${outputFolder} ---`);
    
    await page.goto(`https://www.ceneo.pl/${productId}/opinie-1`, { waitUntil: 'domcontentloaded' });
    
    const productNameRaw = await page.evaluate(() => {
        const titleEl = document.querySelector('h1.product-top__product-info__name');
        return titleEl ? titleEl.innerText.trim() : 'Unknown_Product';
    });

    const productNameSafe = productNameRaw
        .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 50);

    console.log(`Produkt: ${productNameSafe}`);

    let collectedData = [];
    let currentPage = 1;

    while (collectedData.length < targetReviewCount) {
        const currentUrl = `https://www.ceneo.pl/${productId}/opinie-${currentPage}`;
        console.log(`Strona ${currentPage} | Pobrano łącznie: ${collectedData.length}/${targetReviewCount}`);

        await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });

        const hasReviews = await page.$('.js_product-review');
        if (!hasReviews) {
            console.log("Brak opinii na tej stronie (Koniec).");
            break;
        }

        const pageReviews = await page.evaluate((productNameSafe) => {
            const rows = [];
            const cards = document.querySelectorAll('.js_product-review');

            cards.forEach(card => {
                const contentEl = card.querySelector('.user-post__text');
                const ratingEl = card.querySelector('.user-post__score-count');

                if (contentEl && ratingEl) {
                    const rawRating = ratingEl.innerText.trim(); 
                    let stars = 0;
                    try {
                        const numberPart = rawRating.split('/')[0].replace(',', '.');
                        stars = parseFloat(numberPart);
                    } catch (e) {}

                    const normalizedScore = (stars / 5).toFixed(3);
                    const sentiment = stars >= 2.5 ? "P" : "N";

                    rows.push({
                        productName: productNameSafe,
                        score: normalizedScore,
                        sentiment: sentiment,
                        content: contentEl.innerText.trim()
                    });
                }
            });
            return rows;
        }, productNameSafe);

        if (pageReviews.length === 0) {
            console.log("Strona załadowana, ale brak treści opinii. Kończę.");
            break;
        }

        collectedData = [...collectedData, ...pageReviews];

        currentPage++;

        await sleep(1000 + Math.random() * 1000);
    }

    console.log("--- Zapisywanie plików... ---");
    
    if (collectedData.length > 0) {
        const finalData = collectedData.slice(0, targetReviewCount);

        finalData.forEach((r, index) => {

            const fileName = `${r.productName}_${r.score}_${r.sentiment}_${index + 1}.txt`;
            const filePath = path.join(outputFolder, fileName);

            fs.writeFileSync(filePath, r.content, { encoding: 'utf8' });
        });
        console.log(`\nSUKCES! Utworzono ${finalData.length} plików w folderze: ${outputFolder}`);
    } else {
        console.log("Nie udało się pobrać żadnych opinii.");
    }

    await browser.close();
};

scrapeCeneoFiles();