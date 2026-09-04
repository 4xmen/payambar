import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ConversationItem from '@/components/chat/ConversationItem.vue';
import ProfileTab from '@/components/profile/tabs/ProfileTab.vue';
import MessagesContainer from '@/components/chat/MessagesContainer.vue';
import AuthContainer from '@/components/auth/AuthContainer.vue';
import ProfileModal from '@/components/profile/ProfileModal.vue';
import NewChatModal from '@/components/chat/NewChatModal.vue';
import ConfirmModal from '@/components/ui/ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import type { Conversation, Message } from '@/types';

declare const require: any;
const fs = typeof require !== 'undefined' ? require('fs') : null;
const path = typeof require !== 'undefined' ? require('path') : null;

describe('Navigation and Animation Patterns Unit Tests', () => {
  describe('ConversationItem.vue keyboard accessibility', () => {
    const sampleConv: Conversation = {
      id: 1,
      user_id: 10,
      username: 'testuser',
      display_name: 'Test User',
      last_message_at: '2026-02-23T10:00:00Z',
      last_message_preview: 'Hello',
      unread_count: 0,
      is_online: true,
    };

    it('has role="button" and tabindex="0"', () => {
      const wrapper = mount(ConversationItem, {
        props: {
          conversation: sampleConv,
          isActive: false,
        },
      });

      expect(wrapper.attributes('role')).toBe('button');
      expect(wrapper.attributes('tabindex')).toBe('0');
    });

    it('emits select event on Enter key press', async () => {
      const wrapper = mount(ConversationItem, {
        props: {
          conversation: sampleConv,
          isActive: false,
        },
      });

      await wrapper.trigger('keydown.enter');
      expect(wrapper.emitted('select')).toBeTruthy();
      expect(wrapper.emitted('select')?.[0]).toEqual([sampleConv]);
    });

    it('emits select event on Space key press', async () => {
      const wrapper = mount(ConversationItem, {
        props: {
          conversation: sampleConv,
          isActive: false,
        },
      });

      await wrapper.trigger('keydown.space');
      expect(wrapper.emitted('select')).toBeTruthy();
      expect(wrapper.emitted('select')?.[0]).toEqual([sampleConv]);
    });

    it('does not emit select event when Enter or Space is pressed on menu button', async () => {
      const wrapper = mount(ConversationItem, {
        props: {
          conversation: sampleConv,
          isActive: false,
        },
      });

      const menuBtn = wrapper.find('.conversation-menu-btn');
      await menuBtn.trigger('keydown.enter');
      await menuBtn.trigger('keydown.space');
      expect(wrapper.emitted('select')).toBeFalsy();
    });
  });

  describe('ProfileTab.vue avatar button keyboard accessibility', () => {
    it('renders avatar button as a focusable button element with aria-label', () => {
      const wrapper = mount(ProfileTab);
      const avatarBtn = wrapper.find('button.profile-avatar-large');
      expect(avatarBtn.exists()).toBe(true);
      expect(avatarBtn.attributes('type')).toBe('button');
      expect(avatarBtn.attributes('aria-label')).toBe('تغییر تصویر پروفایل');
    });

    it('triggers file input click on Enter key press', async () => {
      const wrapper = mount(ProfileTab);
      const avatarBtn = wrapper.find('button.profile-avatar-large');
      const fileInput = wrapper.find<HTMLInputElement>('input[type="file"]');
      const clickSpy = vi.spyOn(fileInput.element, 'click');

      await avatarBtn.trigger('keydown.enter');
      expect(clickSpy).toHaveBeenCalled();
    });

    it('triggers file input click on Space key press', async () => {
      const wrapper = mount(ProfileTab);
      const avatarBtn = wrapper.find('button.profile-avatar-large');
      const fileInput = wrapper.find<HTMLInputElement>('input[type="file"]');
      const clickSpy = vi.spyOn(fileInput.element, 'click');

      await avatarBtn.trigger('keydown.space');
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('MessagesContainer.vue safe entrance animation', () => {
    const historicalMessages: Message[] = [
      { id: 1, sender_id: 1, receiver_id: 2, content: 'Old 1', status: 'read', created_at: '2026-02-23T10:00:00Z' },
      { id: 2, sender_id: 2, receiver_id: 1, content: 'Old 2', status: 'read', created_at: '2026-02-23T10:01:00Z' },
      { id: 3, sender_id: 1, receiver_id: 2, content: 'Old 3', status: 'read', created_at: '2026-02-23T10:02:00Z' },
    ];

    it('does not animate historical messages on initial load', async () => {
      const wrapper = mount(MessagesContainer, {
        props: {
          currentConversationId: 10,
          loadingMessages: false,
          loadingOlderMessages: false,
          hasMore: false,
          messages: historicalMessages,
          myUserId: 1,
          pullToRefresh: {
            startY: 0,
            currentY: 0,
            pulling: false,
            refreshing: false,
            threshold: 70,
            ready: false,
          },
        },
      });

      const items = wrapper.findAll('.message');
      expect(items.length).toBe(3);
      for (const item of items) {
        expect(item.classes()).not.toContain('message-live-enter');
      }
    });

    it('does not animate older messages when loading older messages', async () => {
      const wrapper = mount(MessagesContainer, {
        props: {
          currentConversationId: 10,
          loadingMessages: false,
          loadingOlderMessages: false,
          hasMore: true,
          messages: historicalMessages,
          myUserId: 1,
          pullToRefresh: {
            startY: 0,
            currentY: 0,
            pulling: false,
            refreshing: false,
            threshold: 70,
            ready: false,
          },
        },
      });

      const prependedMessages: Message[] = [
        { id: 99, sender_id: 2, receiver_id: 1, content: 'Even older', status: 'read', created_at: '2026-02-23T09:00:00Z' },
        ...historicalMessages,
      ];

      await wrapper.setProps({
        loadingOlderMessages: true,
        messages: prependedMessages,
      });

      const items = wrapper.findAll('.message');
      expect(items.length).toBe(4);
      for (const item of items) {
        expect(item.classes()).not.toContain('message-live-enter');
      }
    });

    it('animates newly arrived live message', async () => {
      const wrapper = mount(MessagesContainer, {
        props: {
          currentConversationId: 10,
          loadingMessages: false,
          loadingOlderMessages: false,
          hasMore: false,
          messages: historicalMessages,
          myUserId: 1,
          pullToRefresh: {
            startY: 0,
            currentY: 0,
            pulling: false,
            refreshing: false,
            threshold: 70,
            ready: false,
          },
        },
      });

      const liveMsg: Message = {
        id: 4,
        sender_id: 2,
        receiver_id: 1,
        content: 'Fresh incoming message',
        status: 'delivered',
        created_at: '2026-02-23T10:05:00Z',
      };

      await wrapper.setProps({
        messages: [...historicalMessages, liveMsg],
      });

      const items = wrapper.findAll('.message');
      expect(items.length).toBe(4);
      expect(items[0].classes()).not.toContain('message-live-enter');
      expect(items[1].classes()).not.toContain('message-live-enter');
      expect(items[2].classes()).not.toContain('message-live-enter');
      expect(items[3].classes()).toContain('message-live-enter');
    });
  });

  describe('AuthContainer.vue transition wrapper', () => {
    it('renders auth mode transition wrapper', () => {
      const wrapper = mount(AuthContainer);
      expect(wrapper.findComponent({ name: 'LoginForm' }).exists()).toBe(true);
    });
  });

  describe('Modal exit animation fallback', () => {
    const cssProto = Object.getPrototypeOf(window.CSS);

    it('applies modal-closing class when ProfileModal closes in fallback mode', async () => {
      const supportsSpy = vi.spyOn(cssProto, 'supports').mockReturnValue(false);
      const wrapper = mount(ProfileModal, {
        props: {
          isOpen: true,
          appVersion: '1.0.0',
        },
      });

      expect(wrapper.find('dialog').classes()).not.toContain('modal-closing');
      await wrapper.setProps({ isOpen: false });
      expect(wrapper.find('dialog').classes()).toContain('modal-closing');
      supportsSpy.mockRestore();
    });

    it('applies modal-closing class when NewChatModal closes in fallback mode', async () => {
      const supportsSpy = vi.spyOn(cssProto, 'supports').mockReturnValue(false);
      const wrapper = mount(NewChatModal, {
        props: {
          isOpen: true,
          token: 'mock-token',
        },
      });

      expect(wrapper.find('dialog').classes()).not.toContain('modal-closing');
      await wrapper.setProps({ isOpen: false });
      expect(wrapper.find('dialog').classes()).toContain('modal-closing');
      supportsSpy.mockRestore();
    });

    it('applies modal-closing class when ConfirmModal closes in fallback mode', async () => {
      const supportsSpy = vi.spyOn(cssProto, 'supports').mockReturnValue(false);
      const { confirm, handleCancel } = useConfirm();
      confirm({ title: 'تایید خروج', message: 'آیا اطمینان دارید؟' });
      const wrapper = mount(ConfirmModal);
      const dialog = wrapper.find('dialog');
      expect(dialog.classes()).not.toContain('modal-closing');

      handleCancel();
      await wrapper.vm.$nextTick();
      expect(dialog.classes()).toContain('modal-closing');
      supportsSpy.mockRestore();
    });
  });

  describe('URL Navigation and Routing Patterns', () => {
    it('correctly matches deep linking path patterns', () => {
      const chatPath = '/chat/123';
      const chatMatch = chatPath.match(/^\/chat\/(\d+)/);
      expect(chatMatch).toBeTruthy();
      expect(chatMatch?.[1]).toBe('123');

      const nonChatPath = '/profile';
      expect(nonChatPath.match(/^\/chat\/(\d+)/)).toBeNull();
    });

    it('parses call_from and auto_answer query parameters', () => {
      const search = '?call_from=42&auto_answer=1';
      const params = new URLSearchParams(search);
      expect(params.get('call_from')).toBe('42');
      expect(params.get('auto_answer')).toBe('1');
    });

    it('handles call_from query parameter without auto_answer', () => {
      const search = '?call_from=77';
      const params = new URLSearchParams(search);
      expect(params.get('call_from')).toBe('77');
      expect(params.get('auto_answer')).toBeNull();
    });
  });

  describe('CSS rules verification in styles.css', () => {
    const css = fs && path ? fs.readFileSync(path.resolve('styles.css'), 'utf-8') : '';

    it('contains @media (prefers-reduced-motion: reduce)', () => {
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('contains @starting-style and transition-behavior: allow-discrete for modals', () => {
      expect(css).toContain('@starting-style');
      expect(css).toContain('allow-discrete');
      expect(css).toContain('dialog.modal[open]');
    });

    it('ensures closed modals are display: none for discrete transitions', () => {
      expect(css).toMatch(/dialog\.modal\s*\{[^}]*display:\s*none/);
      expect(css).toMatch(/dialog\.confirm-modal-dialog\s*\{[^}]*display:\s*none/);
    });

    it('contains modal-closing fallback animation classes', () => {
      expect(css).toContain('dialog.modal.modal-closing');
      expect(css).toContain('dialog.confirm-modal-dialog.modal-closing');
    });

    it('contains .fade transition classes for micro-interactions', () => {
      expect(css).toContain('.fade-enter-active');
      expect(css).toContain('.fade-leave-active');
      expect(css).toContain('.fade-enter-from');
      expect(css).toContain('.fade-leave-to');
    });

    it('contains mobile transform: translateX for smooth RTL transitions', () => {
      expect(css).toContain('transform: translateX(100%)');
      expect(css).toContain('transform: translateX(-100%)');
    });

    it('ensures .message-menu-btn is styled for focus and focus-visible', () => {
      expect(css).toContain('.message-menu-btn:focus');
      expect(css).toContain('.message-menu-btn:focus-visible');
    });

    it('contains message-live-enter animation rule', () => {
      expect(css).toContain('.message.message-live-enter');
      expect(css).toContain('@keyframes messageSlideIn');
    });
  });
});
