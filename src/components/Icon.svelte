<script lang="ts">
  export let name: string;
  export let size = 18;
</script>

<svg
  aria-hidden="true"
  focusable="false"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  class="ui-icon"
>
  {#if name === 'arrow-up-right'}
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  {:else if name === 'external-link'}
    <path d="M14 4h6v6" />
    <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
    <path d="m13 11 7-7" />
  {:else if name === 'history'}
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  {:else if name === 'star' || name === 'star-filled'}
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" fill={name === 'star-filled' ? 'currentColor' : 'none'} />
  {:else if name === 'timer'}
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 1.5M9 2h6M12 5V2" />
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3" />
    <path d="M19 13.5a7.7 7.7 0 0 0 0-3l1.6-1.2-1.6-2.8-1.9.7a7.8 7.8 0 0 0-2.6-1.5L14.2 4h-3.4l-.3 1.7a7.8 7.8 0 0 0-2.6 1.5L6 6.5 4.4 9.3 6 10.5a7.7 7.7 0 0 0 0 3l-1.6 1.2L6 17.5l1.9-.7a7.8 7.8 0 0 0 2.6 1.5l.3 1.7h3.4l.3-1.7a7.8 7.8 0 0 0 2.6-1.5l1.9.7 1.6-2.8Z" />
  {:else if name === 'search'}
    <circle cx="10.8" cy="10.8" r="6.8" />
    <path d="m16 16 4.5 4.5" />
  {:else if name === 'copy'}
    <rect x="8" y="8" width="13" height="13" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  {:else if name === 'share'}
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.1" />
  {:else if name === 'play'}
    <path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />
  {:else if name === 'pause'}
    <path d="M8 5h3v14H8zM15 5h3v14h-3z" fill="currentColor" stroke="none" />
  {:else if name === 'square'}
    <rect x="6" y="6" width="12" height="12" rx="1" />
  {:else if name === 'x'}
    <path d="m18 6-12 12M6 6l12 12" />
  {:else if name === 'shuffle'}
    <path d="m16 3 4 4-4 4M4 7h3c5 0 5 10 10 10h3" />
    <path d="m16 13 4 4-4 4M4 17h3c1.8 0 2.8-1.4 3.7-3" />
  {:else if name === 'trash'}
    <path d="M3 6h18M8 6V4h8v2m-11 0 1 14h12l1-14M10 10v6m4-6v6" />
  {:else if name === 'pencil'}
    <path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l0 5Z" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'paste'}
    <rect x="8" y="3" width="8" height="4" rx="1" />
    <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2M16 5h2a2 2 0 0 1 2 2v4m1 3h-7m3-4-4 4 4 4" />
  {/if}
</svg>

<style>
  .ui-icon { display: inline-block; flex: 0 0 auto; vertical-align: middle; }
</style>
