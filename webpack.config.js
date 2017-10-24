const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CleanWebpackPlugin = require('clean-webpack-plugin')
const ExtractTextPlugin = require("extract-text-webpack-plugin")
const microloaderConfig = require('./microloader.json')

module.exports = [
    // Microloader code
    {
        entry: './src/main.js',
        output: {
            filename: 'loader' + microloaderConfig['loader_version'] + '.js',
            path: path.resolve(__dirname, 'dist')
        },
        plugins: [
            new CleanWebpackPlugin(['dist']),
            new HtmlWebpackPlugin({
                title: 'Micro loader'
            })
        ],
        devServer: {
            contentBase: [path.join(__dirname, 'dist'), path.join(__dirname, 'assets')]
        }
    },
    // Microloader service worker
    {
        entry: './src/sw.js',
        output: {
            filename: 'sw.js',
            path: path.resolve(__dirname, 'dist')
        }
    },
    // Test code
    {
        entry: ['./src/app.js'],
        output: {
            filename: 'app' + microloaderConfig['app_version'] + '.js',
            path: path.resolve(__dirname, 'dist')
        }
    },
    // Styles
    {
        entry: ['./styles/app.css'],
        output: {
            filename: 'app' + microloaderConfig['app_version'] + '.css',
            path: path.resolve(__dirname, 'dist')
        },
        module: {
            rules: [
                {
                    test: /\.css$/,
                    use: ExtractTextPlugin.extract({
                        use: ['css-loader']
                    })
                }
            ]
        },
        plugins: [new ExtractTextPlugin('app' + microloaderConfig['app_version'] + '.css')]
    }
]

// module.rules =
//     [
//         { test: /\.css$/, use: 'css-loader' }
//     ]
