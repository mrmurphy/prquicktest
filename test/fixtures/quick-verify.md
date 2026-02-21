# Quick Verification

## Testing

### Setup
```bash
export BASE_URL="http://example.com"
export API_TOKEN="test123"
```

### Test 1: Env vars propagate
```bash
echo "BASE_URL=$BASE_URL"
echo "API_TOKEN=$API_TOKEN"
```

### Test 2: Working directory persists
```bash
cd /tmp
pwd
```

### Test 3: Working directory carried over
```bash
pwd
```

### Test 4: Unsupported language skipped
```javascript
console.log("should be skipped")
```

### Test 5: Bash still works after skip
```bash
echo "still working after skip"
echo "BASE_URL still=$BASE_URL"
```
