<script setup lang="ts">
const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <h3>قوانین استفاده و رمزنگاری</h3>
        <button class="icon-btn ghost" @click="emit('close')" aria-label="بستن">✕</button>
      </div>
      <div class="modal-body">
        <ul class="rules-list">
          <li>پیام‌ها بین کاربرانی که کلید دارند، به صورت سرتاسری (E2EE) رمزنگاری می‌شود.</li>
          <li>اگر طرف مقابل هنوز کلید منتشر نکرده باشد، پیام شما به‌صورت متن ساده ارسال می‌شود تا قابل خواندن بماند.</li>
          <li>کلید خصوصی فقط به شکل رمزنگاری‌شده روی سرور پشتیبان‌گیری می‌شود و بدون رمز عبور شما قابل استفاده نیست.</li>
          <li>مسئولیت محتوای پیام‌ها، تخلفات و عواقب حقوقی بر عهده فرستنده و دریافت‌کننده است؛ سرویس مسئولیتی ندارد.</li>
          <li>از ارسال هرگونه محتوای غیرقانونی، آزاردهنده یا نقض‌کننده حقوق دیگران خودداری کنید.</li>
        </ul>
      </div>
      <div class="modal-footer">
        <button class="primary-btn" @click="emit('close')">متوجه شدم</button>
      </div>
    </div>
  </div>
</template>
