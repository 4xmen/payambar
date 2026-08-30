import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoginForm from '@/components/auth/LoginForm.vue';
import RegisterForm from '@/components/auth/RegisterForm.vue';
import RulesModal from '@/components/auth/RulesModal.vue';
import UserProfileBar from '@/components/chat/UserProfileBar.vue';
import ConversationItem from '@/components/chat/ConversationItem.vue';
import UserSearchItem from '@/components/chat/UserSearchItem.vue';
import ChatHeader from '@/components/chat/ChatHeader.vue';
import MessageItem from '@/components/chat/MessageItem.vue';
import ActiveCallBar from '@/components/call/ActiveCallBar.vue';
import type { Conversation, Message } from '@/types';

describe('Component Unit Tests', () => {
  describe('RulesModal.vue', () => {
    it('renders rules modal and emits close event on button click', async () => {
      const wrapper = mount(RulesModal);
      expect(wrapper.text()).toContain('قوانین استفاده و رمزنگاری');
      const closeBtn = wrapper.find('.primary-btn');
      await closeBtn.trigger('click');
      expect(wrapper.emitted('close')).toBeTruthy();
    });
  });

  describe('LoginForm.vue', () => {
    it('renders username and password inputs', () => {
      const wrapper = mount(LoginForm);
      const inputs = wrapper.findAll('input');
      expect(inputs.length).toBe(2);
      expect(inputs[0].attributes('placeholder')).toBe('نام‌کاربری');
      expect(inputs[1].attributes('placeholder')).toBe('رمز‌عبور');
    });
  });

  describe('RegisterForm.vue', () => {
    it('renders username, password, confirm, rules checkbox', () => {
      const wrapper = mount(RegisterForm);
      const inputs = wrapper.findAll('input');
      expect(inputs.length).toBe(4);
      expect(inputs[0].attributes('placeholder')).toBe('نام‌کاربری');
      expect(inputs[3].attributes('type')).toBe('checkbox');
    });
  });

  describe('UserProfileBar.vue', () => {
    it('renders user profile info and emits open-profile on click', async () => {
      const wrapper = mount(UserProfileBar, {
        props: {
          avatarUrl: null,
          username: 'sadegh',
          displayName: 'صادق',
          statusText: 'آنلاین',
        },
      });

      expect(wrapper.text()).toContain('صادق');
      expect(wrapper.text()).toContain('آنلاین');
      await wrapper.find('.user-avatar').trigger('click');
      expect(wrapper.emitted('open-profile')).toBeTruthy();
    });
  });

  describe('ConversationItem.vue', () => {
    it('renders conversation details and emits select on click', async () => {
      const conv: Conversation = {
        id: 1,
        user_id: 10,
        username: 'alice',
        display_name: 'Alice Wonder',
        last_message_at: '2026-02-23T10:00:00Z',
        last_message_preview: 'سلام',
        unread_count: 3,
        is_online: true,
      };

      const wrapper = mount(ConversationItem, {
        props: {
          conversation: conv,
          isActive: false,
        },
      });

      expect(wrapper.text()).toContain('Alice Wonder');
      expect(wrapper.text()).toContain('سلام');
      expect(wrapper.find('.unread-badge').text()).toBe('3');
      expect(wrapper.find('.online-indicator').exists()).toBe(true);

      await wrapper.trigger('click');
      expect(wrapper.emitted('select')?.[0]).toEqual([conv]);
    });
  });

  describe('UserSearchItem.vue', () => {
    it('renders search result user and emits select', async () => {
      const rawUser = {
        id: 5,
        username: 'bob',
        display_name: 'Bob Ross',
        avatar_url: '',
        is_online: true,
      };

      const wrapper = mount(UserSearchItem, {
        props: {
          user: rawUser,
        },
      });

      expect(wrapper.text()).toContain('Bob Ross');
      expect(wrapper.text()).toContain('@bob');
      expect(wrapper.text()).toContain('آنلاین');

      await wrapper.trigger('click');
      expect(wrapper.emitted('select')).toBeTruthy();
    });
  });

  describe('ChatHeader.vue', () => {
    it('renders active chat header with call button and emits call', async () => {
      const conv: Conversation = {
        id: 1,
        user_id: 20,
        username: 'maryam',
        display_name: 'مریم',
        is_online: true,
      };

      const wrapper = mount(ChatHeader, {
        props: {
          conversation: conv,
          currentConversationId: 20,
        },
      });

      expect(wrapper.text()).toContain('مریم');
      expect(wrapper.text()).toContain('آنلاین');

      const callBtn = wrapper.find('.call-btn');
      expect(callBtn.exists()).toBe(true);
      await callBtn.trigger('click');
      expect(wrapper.emitted('call')).toBeTruthy();
    });
  });

  describe('MessageItem.vue', () => {
    it('renders text message bubble with sent/received styling', () => {
      const msg: Message = {
        id: 1,
        sender_id: 1,
        receiver_id: 2,
        content: 'سلام روز بخیر',
        status: 'read',
        created_at: '2026-02-23T10:00:00Z',
      };

      const wrapper = mount(MessageItem, {
        props: {
          message: msg,
          index: 0,
          allMessages: [msg],
          myUserId: 1,
        },
      });

      expect(wrapper.classes()).toContain('sent');
      expect(wrapper.text()).toContain('سلام روز بخیر');
      expect(wrapper.find('.message-status').exists()).toBe(true);
      // Double check has 2 paths in SVG
      expect(wrapper.findAll('.message-status svg path').length).toBe(2);
    });

    it('renders single check for sent status on latest message', () => {
      const msg: Message = {
        id: 1,
        sender_id: 1,
        receiver_id: 2,
        content: 'پیام ارسال شده',
        status: 'sent',
        created_at: '2026-02-23T10:00:00Z',
      };

      const wrapper = mount(MessageItem, {
        props: {
          message: msg,
          index: 0,
          allMessages: [msg],
          myUserId: 1,
        },
      });

      expect(wrapper.find('.message-status').exists()).toBe(true);
      // Single check has 1 path in SVG
      expect(wrapper.findAll('.message-status svg path').length).toBe(1);
    });

    it('does not show message status for older messages when newer sent message exists', () => {
      const msg1: Message = {
        id: 1,
        sender_id: 1,
        receiver_id: 2,
        content: 'پیام اول',
        status: 'read',
        created_at: '2026-02-23T10:00:00Z',
      };
      const msg2: Message = {
        id: 2,
        sender_id: 1,
        receiver_id: 2,
        content: 'پیام دوم',
        status: 'sent',
        created_at: '2026-02-23T10:01:00Z',
      };

      const wrapper1 = mount(MessageItem, {
        props: {
          message: msg1,
          index: 0,
          allMessages: [msg1, msg2],
          myUserId: 1,
        },
      });
      expect(wrapper1.find('.message-status').exists()).toBe(false);

      const wrapper2 = mount(MessageItem, {
        props: {
          message: msg2,
          index: 1,
          allMessages: [msg1, msg2],
          myUserId: 1,
        },
      });
      expect(wrapper2.find('.message-status').exists()).toBe(true);
    });

    it('renders image media message', () => {
      const msg: Message = {
        id: 2,
        sender_id: 2,
        receiver_id: 1,
        content: '',
        file_url: '/uploads/pic.png',
        file_name: 'pic.png',
        status: 'delivered',
        created_at: '2026-02-23T10:05:00Z',
      };

      const wrapper = mount(MessageItem, {
        props: {
          message: msg,
          index: 1,
          allMessages: [msg],
          myUserId: 1,
        },
      });

      expect(wrapper.classes()).toContain('received');
      expect(wrapper.find('img.message-image').exists()).toBe(true);
      expect(wrapper.find('.message-status').exists()).toBe(false);
    });
  });

  describe('ActiveCallBar.vue', () => {
    it('renders active call details and buttons', async () => {
      const wrapper = mount(ActiveCallBar, {
        props: {
          activeCall: {
            user_id: 10,
            username: 'reza',
            displayName: 'رضا',
          },
          callDuration: '02:15',
          chatListOpen: false,
          currentConversationId: 10,
        },
      });

      expect(wrapper.text()).toContain('در حال مکالمه با رضا');
      expect(wrapper.text()).toContain('02:15');

      const hangupBtn = wrapper.find('.btn-hangup');
      await hangupBtn.trigger('click');
      expect(wrapper.emitted('hangup')).toBeTruthy();
    });
  });
});
