const fs = require('fs');
const path = require('path');

// МЕНЯЙ ТУТ ЕСЛИ ХОЧЕШЬ ДРУГОЕ ИМЯ
const NEW_NAME = {
    name: 'StudioHelper',            // studiohelper.exe
    displayName: 'Studio Helper',    // Studio Helper
    description: 'Development Studio Assistant',
    configDir: 'StudioHelper'        // AppData/Roaming/StudioHelper
};

console.log('🔄 Starting rename to: ' + NEW_NAME.displayName);

// Простая замена во всех файлах
function renameInFiles() {
    const files = [
        'package.json',
        'src/index.js',
        'src/storage.js',
        'src/utils/window.js'
    ];

    files.forEach(file => {
        if (fs.existsSync(file)) {
            try {
                let content = fs.readFileSync(file, 'utf8');

                // Заменяем все варианты
                content = content.replace(/cheating-daddy/gi, NEW_NAME.name.toLowerCase());
                content = content.replace(/CheatingDaddy/gi, NEW_NAME.name);
                content = content.replace(/Cheating Daddy/gi, NEW_NAME.displayName);
                content = content.replace(/SystemDiagnostics/gi, NEW_NAME.name);
                content = content.replace(/OES Fighter/gi, NEW_NAME.displayName);
                content = content.replace(/OESFighter/gi, NEW_NAME.name);

                // Особые замены для package.json
                if (file === 'package.json') {
                    const pkg = JSON.parse(content);
                    pkg.name = NEW_NAME.name.toLowerCase();
                    pkg.productName = NEW_NAME.displayName;
                    pkg.description = NEW_NAME.description;
                    content = JSON.stringify(pkg, null, 2);
                }

                // Особые замены для storage.js
                if (file === 'src/storage.js') {
                    content = content.replace(
                        /AppData\\\\Roaming\\\\[^'"]+/,
                        `AppData\\\\Roaming\\\\${NEW_NAME.configDir}`
                    );
                }

                fs.writeFileSync(file, content, 'utf8');
                console.log('✅ Updated: ' + file);
            } catch (err) {
                console.log('⚠️  Skipped: ' + file + ' - ' + err.message);
            }
        }
    });
}

// Переименовываем папку если нужно
function renameFolder() {
    const currentDir = process.cwd();
    const dirName = path.basename(currentDir);

    if (dirName.includes('cheating') || dirName.includes('oes')) {
        const parentDir = path.dirname(currentDir);
        const newDir = path.join(parentDir, NEW_NAME.name);

        console.log('📁 Would rename folder to: ' + NEW_NAME.name);
        console.log('📝 Note: Close all files in this folder first!');
    }
}

// Создаем чистый README
function createReadme() {
    const readme = `# ${NEW_NAME.displayName}

${NEW_NAME.description}

## Installation
\`\`\`bash
npm install
npm start
\`\`\`

## Building
\`\`\`bash
npm run make
\`\`\`
`;

    fs.writeFileSync('README.md', readme, 'utf8');
    console.log('✅ Created README.md');
}

// Запускаем
try {
    renameInFiles();
    renameFolder();
    createReadme();

    console.log('\n' + '='.repeat(50));
    console.log('✅ RENAME COMPLETE!');
    console.log('='.repeat(50));
    console.log('\nNext steps:');
    console.log('1. Delete node_modules folder');
    console.log('2. Run: npm install');
    console.log('3. Run: npm run make');
    console.log('\nNew app name: ' + NEW_NAME.displayName);
} catch (err) {
    console.log('❌ Error: ' + err.message);
}