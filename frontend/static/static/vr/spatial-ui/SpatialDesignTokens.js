export const SpatialDesignTokens = Object.freeze({
    colors: {
        ink: '#0B1726',
        inkSoft: '#243449',
        muted: '#52657C',
        subtle: '#7A8DA6',

        panelA: 'rgba(255,255,255,.98)',
        panelB: 'rgba(234,248,255,.94)',
        panelC: 'rgba(225,255,239,.86)',

        blue: '#3AB7FF',
        mint: '#64E9AD',
        violet: '#8EA2FF',
        rose: '#FF6F8D',
        amber: '#F2B84B',
    },

    /*
     * Near-readability VR baseline.
     *
     * 0.5m is available as Near mode, but not the permanent default.
     * Default 0.75m gives readability without completely blocking the protein.
     */
    scale: {
        root: 0.32,
        distance: 0.75,
        nearDistance: 0.50,
        farDistance: 0.95,
        yOffset: -0.04,
    },

    sizes: {
        panelWidth: 4.85,
        panelHeight: 3.20,

        buttonWidth: 1.78,
        buttonHeight: 0.62,

        wideButtonWidth: 2.20,
        wideButtonHeight: 0.66,

        contextWidth: 4.10,
        contextHeight: 0.96,
    },

    typography: {
        display: '800 88px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        title: '800 66px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        label: '800 58px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        body: '680 42px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        small: '680 34px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        micro: '720 28px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    },
});
