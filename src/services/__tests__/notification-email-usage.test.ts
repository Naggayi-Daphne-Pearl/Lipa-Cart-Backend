const sendOrderStatusUpdateEmailMock = jest.fn().mockResolvedValue(true);

jest.mock('../email', () => ({
  sendOrderStatusUpdateEmail: (...args: any[]) => sendOrderStatusUpdateEmailMock(...args),
}));

jest.mock('firebase-admin', () => ({}));

import { notifyOrderStatusChange } from '../notification';

function createNotificationStrapiMock() {
  return {
    db: {
      connection: {
        raw: jest.fn().mockResolvedValue([{ user_id: 501 }]),
      },
      query: jest.fn((uid: string) => {
        if (uid === 'api::user.user') {
          return {
            findOne: jest.fn().mockResolvedValue({ id: 501, fcm_tokens: [] }),
          };
        }
        if (uid === 'api::notification.notification') {
          return {
            findOne: jest.fn().mockResolvedValue(null),
          };
        }
        return {
          findOne: jest.fn().mockResolvedValue(null),
        };
      }),
    },
    entityService: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
    log: {
      error: jest.fn(),
      warn: jest.fn(),
    },
  };
}

describe('notifyOrderStatusChange email usage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends status email for accepted/intermediate states (shopper_assigned)', async () => {
    const strapiMock = createNotificationStrapiMock();

    await notifyOrderStatusChange(strapiMock, 9001, 'shopper_assigned', 'ORD-9001');

    expect(sendOrderStatusUpdateEmailMock).toHaveBeenCalledWith(
      strapiMock,
      9001,
      'ORD-9001',
      'Shopper Assigned',
    );
  });

  it('does not send generic status email for delivered because receipt flow is dedicated', async () => {
    const strapiMock = createNotificationStrapiMock();

    await notifyOrderStatusChange(strapiMock, 9002, 'delivered', 'ORD-9002');

    expect(sendOrderStatusUpdateEmailMock).not.toHaveBeenCalled();
  });
});
