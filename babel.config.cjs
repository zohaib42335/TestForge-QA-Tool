module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: { node: 'current' },
      },
    ],
    ['@babel/preset-typescript', { allowDeclareFields: true, isTSX: true, allExtensions: true }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
}

