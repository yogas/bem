const techs = {
        // essential
        fileProvider: require('enb/techs/file-provider'),
        fileMerge: require('enb/techs/file-merge'),

        // optimization
        borschik: require('enb-borschik/techs/borschik'),

        // css
        /*postcss: require('enb-postcss/techs/enb-postcss'),
        postcssPlugins: [
            require('postcss-import')(),
            require('postcss-each'),
            require('postcss-for'),
            require('postcss-simple-vars')(),
            require('postcss-calc')(),
            require('postcss-nested'),
            require('rebem-css'),
            require('postcss-url')({ url: 'rebase' }),
            require('autoprefixer')(),
            require('postcss-reporter')()
        ],*/
    
        stylus: require('enb-stylus/techs/stylus'),

        // js
        browserJs: require('enb-js/techs/browser-js'),

        // bemtree
        // bemtree: require('enb-bemxjst/techs/bemtree'),

        // bemhtml
        bemhtml: require('enb-bemxjst/techs/bemhtml'),
        bemjsonToHtml: require('enb-bemxjst/techs/bemjson-to-html'),
    
        htmlBeautify: require('enb-beautify/techs/enb-beautify-html')
    },
    enbBemTechs = require('enb-bem-techs'),
    levels = [
        { path: 'node_modules/bem-core/common.blocks', check: false },
        { path: 'node_modules/bem-core/desktop.blocks', check: false },
        { path: 'node_modules/bem-components/common.blocks', check: false },
        { path: 'node_modules/bem-components/desktop.blocks', check: false },
        { path: 'node_modules/bem-components/design/common.blocks', check: false },
        { path: 'node_modules/bem-components/design/desktop.blocks', check: false },
        'common.blocks',
        'desktop.blocks'
    ];

    fs = require('fs'),
    fse = require('fs-extra'),
    path = require('path'),
    glob = require('glob'),
    rootDir = path.join(__dirname, '..');
    platforms = ['desktop'],
    css = require('enb-css/techs/css'),
    js = require('enb-js/techs/browser-js.js'),
    readTextFile = require('read-text-file');


module.exports = function(config) {
    const isProd = process.env.YENV === 'production';    
    
    // Создаем директории для merged-бандлов (1)
    platforms.forEach(function (platform) {
        var node = path.join(platform + '.bundles', 'merged');

        if (!fs.existsSync(node)) {
            fs.mkdirSync(node);
        }
    });

    // Предоставляем BEMDECL-файлы из бандлов (2)
    config.nodes('*.bundles/*', function (nodeConfig) {
        var node = path.basename(nodeConfig.getPath());

        if (node !== 'merged') {
            nodeConfig.addTechs([
                // essential
                [enbBemTechs.levels, { levels: levels }],
                [techs.fileProvider, { target: '?.bemjson.js' }],
                [enbBemTechs.bemjsonToBemdecl],
                [enbBemTechs.deps],
                [enbBemTechs.files],

                [techs.stylus],

                // bemtree
                // [techs.bemtree, { sourceSuffixes: ['bemtree', 'bemtree.js'] }],

                // bemhtml
                [techs.bemhtml, {
                    sourceSuffixes: ['bemhtml', 'bemhtml.js'],
                    forceBaseTemplates: true,
                    engineOptions : { elemJsInstances : true }
                }],

                // html
                [techs.bemjsonToHtml],

                // client bemhtml
                [enbBemTechs.depsByTechToBemdecl, {
                    target: '?.bemhtml.bemdecl.js',
                    sourceTech: 'js',
                    destTech: 'bemhtml'
                }],
                [enbBemTechs.deps, {
                    target: '?.bemhtml.deps.js',
                    bemdeclFile: '?.bemhtml.bemdecl.js'
                }],
                [enbBemTechs.files, {
                    depsFile: '?.bemhtml.deps.js',
                    filesTarget: '?.bemhtml.files',
                    dirsTarget: '?.bemhtml.dirs'
                }],
                [techs.bemhtml, {
                    target: '?.browser.bemhtml.js',
                    filesTarget: '?.bemhtml.files',
                    sourceSuffixes: ['bemhtml', 'bemhtml.js'],
                    engineOptions : { elemJsInstances : true }
                }],

                // js
                [techs.browserJs, { includeYM: true }],
                [techs.fileMerge, {
                    target: '?.js',
                    sources: ['?.browser.js', '?.browser.bemhtml.js']
                }],
                
                
                [techs.htmlBeautify],

                // borschik
                [techs.borschik, { source: '?.js', target: '?.min.js', minify: isProd }],
                [techs.borschik, { source: '?.css', target: '?.min.css', minify: isProd }]
                
            ]);
            
            nodeConfig.addTargets([/* '?.bemtree.js', */ '?.html', '?.min.css', '?.min.js', '?.beauty.html']);
        }
    });
    
    // Настраиваем сборку merged-бандла
    config.nodes('*.bundles/merged', function (nodeConfig) {
        var dir = path.dirname(nodeConfig.getPath()),
            bundles = fs.readdirSync(dir),
            bemdeclFiles = [];

        // Копируем BEMDECL-файлы в merged-бандл (3)
        bundles.forEach(function (bundle) {
            if (bundle === 'merged') return;

            var node = path.join(dir, bundle),
                target = bundle + '.bemdecl.js';
            
            nodeConfig.addTechs([
                [enbBemTechs.provideBemdecl, { node : node, target : target }]
            ]);

            bemdeclFiles.push(target);
        });
        
        // Объединяем скопированные BEMDECL-файлы (4)
        nodeConfig.addTechs([
            [enbBemTechs.mergeBemdecl, { sources: bemdeclFiles }]
        ]);
        
        // Обычная сборка бандла (5)
        nodeConfig.addTechs([
            [enbBemTechs.levels, { levels: ['desktop.blocks','common.blocks'] }],
            [enbBemTechs.deps],
            [enbBemTechs.files],
            
            [techs.stylus],

            [js, { target: '?.js' }],
            
            [techs.borschik, { source: '?.css', target: '?.min.css', minify: true }],
            [techs.borschik, { source: '?.css', target: '?.dist.css', minify: false }],
        ]);

        nodeConfig.addTargets(['?.min.css', '?.dist.css', '?.js']);
    });
    
    /**
     * Task for build dist package, it will create folder 'dist'
     * and put in it *.html, *.css, *.js, img dir
     * depend: .borschik config
     */
    config.task('dist', function (task) {

        // build targets and copy it to 'dist' folder
        function copyTargets(buildInfo) {
            buildInfo.builtTargets.forEach(function (target) {
                var isMerged = target.match(/merged\./),
                    isBeauty = target.match(/beauty\.html$/),
                    basename = path.basename(target),
                    src = path.join(rootDir, target),
                    dst = "",
                    sub = basename.split("."),
                    replaceFiles = [],
                    version = (new Date()).getTime();
                
                if(!isMerged && !isBeauty) {
                    return true;
                }
                
                if(isBeauty) {
                    basename = basename.replace('.beauty','');  
                    replaceFiles.push(path.join(rootDir, 'dist', basename));
                }
                
                dst = path.join(rootDir, 'dist', basename);
                
                if(isMerged) {
                    basename = basename.replace('.dist','');
                    subDir = sub[sub.length-1];
                    dst = path.join(rootDir, 'dist/' + subDir, basename);
                    
                    if(basename.match(/merged\..*?css$/)) {
                        replaceFiles.push(dst);
                    }
                }

                fse.copySync(src, dst);
                
                // изменение путей к стилям и скриптам
                replaceFiles.forEach(function( file ) {
                    fs.readFile(file, function(err, content){
                        if(!err) {
                            content = content.toString();
                            content = content.split("../merged/merged.css").join("css/merged.css?v"+version)
                                             .split("../merged/merged.js").join("js/merged.js?v"+version)                            
                                             .split("../../images/").join("img/")
                                             .split("../../dist/").join("../")
                                             .split("../../css/").join("css/")
                                             .split("../../js/").join("js/");
                            
                            fs.open(file, "w", 0644, function(err, handle) {
                                if(!err) {
                                    fs.write(handle, content);
                                }
                            })
                        }
                    });
                });
                
                // копирование шрифтов и js библиотек
                var copyFiles = [
                    {
                        src : path.join(rootDir, 'fonts'),
                        dst : path.join(rootDir, 'dist/fonts')
                    },
                    {
                        src : path.join(rootDir, 'css/fonts.css'),
                        dst : path.join(rootDir, 'dist/css/fonts.css')
                    },
                    {
                        src : path.join(rootDir, 'js/libs'),
                        dst : path.join(rootDir, 'dist/js/libs')
                    },
                    {
                        src : path.join(rootDir, 'images'),
                        dst : path.join(rootDir, 'dist/img')
                    }
                ];
                
                copyFiles.forEach( function( copy ){
                    fse.copySync(copy.src, copy.dst);
                });
                
            });
        }

        return task.buildTargets(glob.sync('*.bundles/*'))
            .then(function (buildInfo) {
                copyTargets(buildInfo);
                task.log('Dist was created.');
            });
    });
    
    return false;

    config.nodes('*.bundles/*', function(nodeConfig) {
        nodeConfig.addTechs([
            // essential
            [enbBemTechs.levels, { levels: levels }],
            [techs.fileProvider, { target: '?.bemjson.js' }],
            [enbBemTechs.bemjsonToBemdecl],
            [enbBemTechs.deps],
            [enbBemTechs.files],

            // css
            /*[techs.postcss, {
                target: '?.css',
                oneOfSourceSuffixes: ['post.css', 'css'],
                plugins: techs.postcssPlugins
            }],*/
            
            [techs.stylus],

            // bemtree
            // [techs.bemtree, { sourceSuffixes: ['bemtree', 'bemtree.js'] }],

            // bemhtml
            [techs.bemhtml, {
                sourceSuffixes: ['bemhtml', 'bemhtml.js'],
                forceBaseTemplates: true,
                engineOptions : { elemJsInstances : true }
            }],

            // html
            [techs.bemjsonToHtml],

            // client bemhtml
            [enbBemTechs.depsByTechToBemdecl, {
                target: '?.bemhtml.bemdecl.js',
                sourceTech: 'js',
                destTech: 'bemhtml'
            }],
            [enbBemTechs.deps, {
                target: '?.bemhtml.deps.js',
                bemdeclFile: '?.bemhtml.bemdecl.js'
            }],
            [enbBemTechs.files, {
                depsFile: '?.bemhtml.deps.js',
                filesTarget: '?.bemhtml.files',
                dirsTarget: '?.bemhtml.dirs'
            }],
            [techs.bemhtml, {
                target: '?.browser.bemhtml.js',
                filesTarget: '?.bemhtml.files',
                sourceSuffixes: ['bemhtml', 'bemhtml.js'],
                engineOptions : { elemJsInstances : true }
            }],

            // js
            [techs.browserJs, { includeYM: true }],
            [techs.fileMerge, {
                target: '?.js',
                sources: ['?.browser.js', '?.browser.bemhtml.js']
            }],

            // borschik
            [techs.borschik, { source: '?.js', target: '?.min.js', minify: isProd }],
            [techs.borschik, { source: '?.css', target: '?.min.css', minify: isProd }]
        ]);

        nodeConfig.addTargets([/* '?.bemtree.js', */ '?.html', '?.min.css', '?.min.js']);
    });
};
