# 🔥 Rive Animation Setup

## What's Implemented

✅ **Campfire Animation** integrated into the landing page
- Located at: `public/campfire.riv` (1.1MB)
- Component: `components/CampfireAnimation.tsx`
- Dynamically loaded to reduce initial bundle size

## Features

1. **Responsive Design**
   - Desktop: Large animation on left, form on right
   - Mobile: Smaller animation above form
   - Smooth transitions and animations

2. **Performance Optimized**
   - Lazy loaded with Next.js `dynamic()` import
   - SSR disabled (client-side only)
   - Loading state with animated placeholder

3. **Visual Enhancements**
   - Animated background gradients
   - Glow effects around animation
   - Smooth entrance animations
   - Enhanced button with shimmer effect

## State Machine Configuration

If your Rive file uses a state machine, you may need to update the component:

```tsx
// In CampfireAnimation.tsx
const { RiveComponent, rive } = useRive({
  src: '/campfire.riv',
  autoplay: true,
  stateMachines: 'Your State Machine Name', // Update this if needed
})
```

**Common state machine names:**
- `'State Machine 1'` (default)
- `'Main'`
- `'Default'`
- Or leave undefined to use the default

## Troubleshooting

### Animation not showing?
1. Check browser console for errors
2. Verify `campfire.riv` exists in `public/` folder
3. Check if state machine name matches your Rive file
4. Try removing `stateMachines` parameter to use default

### Performance issues?
- The WASM runtime (~78KB) loads on first use
- Animation is lazy-loaded to keep initial bundle small
- Consider hosting `.riv` file on CDN for faster loading

### Want to control the animation?
Use `useStateMachineInput` hook:

```tsx
import { useStateMachineInput } from '@rive-app/react-canvas'

const input = useStateMachineInput(rive, 'State Machine 1', 'inputName')
// Then trigger: input.value = true
```

## File Locations

- Animation file: `frontend/public/campfire.riv`
- Component: `frontend/components/CampfireAnimation.tsx`
- Usage: `frontend/app/page.tsx` (landing page)

---

**The landing page now features a beautiful animated campfire! 🔥**

