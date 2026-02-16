#!/bin/bash

# ImgBB Migration Script - Bash Version
API_KEY="9b8b1e167f65f3825ae4e1716c8b9bf5"
SEED_FILE="./scripts/seed.ts"
BACKUP_FILE="./scripts/seed.backup.$(date +%s).ts"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  🖼️  ImgBB Migration Script             ║"
echo "║  Unsplash → ImgBB Image Migration      ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if seed.ts exists
if [ ! -f "$SEED_FILE" ]; then
    echo "❌ ERROR: $SEED_FILE not found!"
    exit 1
fi

# Create backup
echo "💾 Creating backup..."
cp "$SEED_FILE" "$BACKUP_FILE"
echo "   ✅ Backed up to: $BACKUP_FILE"

# Extract unique image URLs using grep
echo ""
echo "📋 Extracting image URLs from seed file..."

# Save URLs to temp file
grep -oE 'https://images\.unsplash\.com/[^"'"'"']+' "$SEED_FILE" | sort -u > /tmp/imgbb_urls.txt

TOTAL=$(wc -l < /tmp/imgbb_urls.txt)

echo "✅ Found $TOTAL unique image URLs"

if [ "$TOTAL" = "0" ]; then
    echo "⚠️  No images to migrate"
    exit 0
fi

echo ""
echo "🚀 Starting migration... This may take a few minutes."
echo ""

SUCCESS=0
FAILED=0
IMG_NUM=1

# Read each URL
while IFS= read -r URL; do
    if [ -z "$URL" ]; then
        continue
    fi
    
    echo ""
    echo "[$IMG_NUM/$TOTAL] Processing image..."
    
    # Download image
    echo "  📥 Downloading: ${URL:0:60}..."
    
    TEMP_FILE="/tmp/lipa-cart-$IMG_NUM.jpg"
    
    if curl -s -L "$URL" -o "$TEMP_FILE" 2>/dev/null; then
        SIZE=$(stat -f%z "$TEMP_FILE" 2>/dev/null || stat -c%s "$TEMP_FILE" 2>/dev/null)
        SIZE_KB=$((SIZE / 1024))
        echo "     ✅ Downloaded ${SIZE_KB}KB"
        
        # Upload to ImgBB
        echo "  📤 Uploading to ImgBB: lipa-cart-$IMG_NUM..."
        
        RESPONSE=$(curl -s -F "key=$API_KEY" -F "image=@$TEMP_FILE" "https://api.imgbb.com/1/upload")
        
        # Parse JSON response to get URL
        IMGBB_URL=$(echo "$RESPONSE" | grep -o '"url":"[^"]*' | cut -d'"' -f4)
        
        if [ ! -z "$IMGBB_URL" ] && [ "$IMGBB_URL" != "null" ]; then
            echo "     ✅ Uploaded: ${IMGBB_URL:0:50}..."
            
            # Replace in seed file
            sed -i '' "s|$URL|$IMGBB_URL|g" "$SEED_FILE"
            
            echo "  ✅ Migration complete"
            SUCCESS=$((SUCCESS + 1))
        else
            echo "     ❌ Upload failed"
            FAILED=$((FAILED + 1))
        fi
        
        rm -f "$TEMP_FILE"
    else
        echo "     ❌ Download failed"
        FAILED=$((FAILED + 1))
    fi
    
    # Wait 5 seconds before next
    if [ $IMG_NUM -lt $TOTAL ]; then
        echo "  ⏳ Waiting 5 seconds..."
        sleep 5
    fi
    
    IMG_NUM=$((IMG_NUM + 1))
    
done < /tmp/imgbb_urls.txt

rm -f /tmp/imgbb_urls.txt

# Report
echo ""
echo ""
echo "════════════════════════════════════════════════════"
echo "📊 MIGRATION REPORT"
echo "════════════════════════════════════════════════════"
echo ""
echo "✅ Successful: $SUCCESS"
echo "❌ Failed: $FAILED"
if [ "$TOTAL" -gt 0 ]; then
    RATE=$((SUCCESS * 100 / TOTAL))
    echo "📊 Success Rate: $RATE%"
fi
echo "════════════════════════════════════════════════════"
echo ""
echo "🎉 Migration complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Review: git diff scripts/seed.ts"
echo "   2. Commit: git add scripts/seed.ts && git commit -m 'Migrate images to ImgBB'"
echo "   3. Seed: npm run seed"
echo ""
