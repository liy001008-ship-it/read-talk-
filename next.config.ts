import type { NextConfig } from 'next';
const config: NextConfig = {devIndicators:false,distDir:process.env.NEXT_DIST_DIR||'.next',serverExternalPackages: ['pdfjs-dist'], experimental: {serverActions: {bodySizeLimit: '100mb'}},async headers(){return [{source:'/:path*',headers:[{key:'X-Frame-Options',value:'DENY'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'}]}];}};
export default config;
