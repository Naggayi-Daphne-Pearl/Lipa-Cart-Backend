#!/usr/bin/env python3
"""
ImgBB URL Mapper - Updates seed.ts with ImgBB image URLs
Extracts successful upload URLs from migration and applies them to seed.ts
"""

import json
import re
import sys

# Mapping of original Unsplash URLs to their ImgBB URLs
# These are the 36 successfully uploaded images
imgbb_urls = {
    "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400": "https://i.ibb.co/1GBStBX3/lipa-cart-2.jpg",
    "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400": "https://i.ibb.co/Cs2SFS3r/lipa-cart-3.jpg",
    "https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400": "https://i.ibb.co/mF475pq7/lipa-cart-4.jpg",
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400": "https://i.ibb.co/1fkpD3mJ/lipa-cart-5.jpg",
    "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400": "https://i.ibb.co/pv1n76ZK/lipa-cart-6.jpg",
    "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=400": "https://i.ibb.co/DDKjWJ33/lipa-cart-7.jpg",
    "https://images.unsplash.com/photo-1544025162-d76694265947?w=800": "https://i.ibb.co/n8BRfYH5/lipa-cart-8.jpg",
    "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400": "https://i.ibb.co/kgFgkdTQ/lipa-cart-10.jpg",
    "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=400": "https://i.ibb.co/N2pYBBJS/lipa-cart-11.jpg",
    "https://images.unsplash.com/photo-1553279768-865429fa0078?w=400": "https://i.ibb.co/JjGQj85G/lipa-cart-12.jpg",
    "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400": "https://i.ibb.co/PZB6D3zc/lipa-cart-13.jpg",
    "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=800": "https://i.ibb.co/gb4syh5p/lipa-cart-14.jpg",
    "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=800": "https://i.ibb.co/JVsVsWHz/lipa-cart-15.jpg",
    "https://images.unsplash.com/photo-1604503468506-a8da13d82571?w=400": "https://i.ibb.co/0YkZGZW3/lipa-cart-17.jpg",
    "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=400": "https://i.ibb.co/hFNPP18g/lipa-cart-18.jpg",
    "https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?w=400": "https://i.ibb.co/MVd4JqmJ/lipa-cart-19.jpg",
    "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800": "https://i.ibb.co/VGGrXYwz/lipa-cart-20.jpg",
    "https://images.unsplash.com/photo-1574316071802-0d684efa7bf5?w=400": "https://i.ibb.co/Czs9DpF7/lipa-cart-22.jpg",
    "https://images.unsplash.com/photo-1589984662646-e7b2e4962f18?w=400": "https://i.ibb.co/xDFKZV0p/lipa-cart-25.jpg",
    "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400": "https://i.ibb.co/cbBMFLLN/lipa-cart-26.jpg",
    "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400": "https://i.ibb.co/P8gqkPHP/lipa-cart-27.jpg",
    "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400": "https://i.ibb.co/7kCPjpZj/lipa-cart-28.jpg",
    "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=800": "https://i.ibb.co/WxYYtJS2/lipa-cart-29.jpg",
    "https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=400": "https://i.ibb.co/hBWYJQhP/lipa-cart-31.jpg",
    "https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400": "https://i.ibb.co/BKqDb5pK/lipa-cart-32.jpg",
    "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=800": "https://i.ibb.co/9mbJrKb5/lipa-cart-33.jpg",
    "https://images.unsplash.com/photo-1592928302636-c83cf1e1c887?w=400": "https://i.ibb.co/0V5gYdJk/lipa-cart-34.jpg",
    "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400": "https://i.ibb.co/7NBFDhb9/lipa-cart-36.jpg",
    "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400": "https://i.ibb.co/RpFbr2CM/lipa-cart-37.jpg",
    "https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400": "https://i.ibb.co/jvYvdnm9/lipa-cart-38.jpg",
    "https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=400": "https://i.ibb.co/7dLSGRCv/lipa-cart-39.jpg",
}

def update_seed_file(filepath):
    print("\n📝 Applying ImgBB URLs to seed.ts...\n")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    replacements = 0
    for original_url, imgbb_url in imgbb_urls.items():
        if original_url in content:
            content = content.replace(original_url, imgbb_url)
            replacements += 1
            print(f"✅ Replaced: {original_url[:50]}...")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"\n✅ Updated {replacements} image URLs in seed.ts\n")

if __name__ == "__main__":
    try:
        update_seed_file("./scripts/seed.ts")
        print("🎉 URL mapping complete!")
        print("\n📋 Next steps:")
        print("   1. Review: git diff scripts/seed.ts")
        print("   2. Commit: git add scripts/seed.ts && git commit -m 'Migrate images to ImgBB'")
        print("   3. Run seed: npm run seed")
        print("   4. Test app and verify images load\n")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
