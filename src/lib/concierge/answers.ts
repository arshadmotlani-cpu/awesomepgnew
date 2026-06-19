export type ConciergeContext = {
  residentName: string;
  pgName?: string;
  roomNumber?: string;
  bedCode?: string;
  rentDuePaise: number;
  electricityDuePaise: number;
  depositBalancePaise: number;
  vacatingStatus: string | null;
  depositDuePaise: number;
};

function formatMoney(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function answerConciergeQuestion(
  question: string,
  ctx: ConciergeContext,
): string {
  const q = question.toLowerCase();

  if (q.includes('rent')) {
    if (ctx.rentDuePaise <= 0) {
      return `Good news — you have no open rent balance right now${ctx.pgName ? ` at ${ctx.pgName}` : ''}. Check the Payments tab for invoice history.`;
    }
    return `Your open rent balance is ${formatMoney(ctx.rentDuePaise)}. Pay from Resident Hub → Payments, or use the Pay → link on each invoice.`;
  }

  if (q.includes('electricity') || q.includes('power') || q.includes('ac')) {
    if (ctx.electricityDuePaise <= 0) {
      return 'No open electricity invoices right now. AC usage is split per tenant — bills appear monthly after the room meter is updated.';
    }
    return `Your open electricity share is ${formatMoney(ctx.electricityDuePaise)}. Upload UPI proof from the electricity invoice in Payments.`;
  }

  if (q.includes('deposit') || q.includes('wallet')) {
    const parts = [
      `Refundable deposit balance: ${formatMoney(ctx.depositBalancePaise)}.`,
    ];
    if (ctx.depositDuePaise > 0) {
      parts.push(`You still owe ${formatMoney(ctx.depositDuePaise)} toward your required deposit.`);
    }
    parts.push('See Wallet for the full ledger.');
    return parts.join(' ');
  }

  if (q.includes('vacat') || q.includes('checkout') || q.includes('leave')) {
    if (!ctx.vacatingStatus) {
      return 'No vacating request on file. Submit one from Requests → Vacating, or WhatsApp support if you need help choosing a date.';
    }
    return `Your vacating request is "${ctx.vacatingStatus.replace(/_/g, ' ')}". Track settlement stages under Vacating in Resident Hub.`;
  }

  if (q.includes('room') || q.includes('bed')) {
    if (ctx.roomNumber && ctx.bedCode) {
      return `You're in Room ${ctx.roomNumber}, Bed ${ctx.bedCode}${ctx.pgName ? ` at ${ctx.pgName}` : ''}. Roommates and amenities are under My room.`;
    }
    return 'Open My room in Resident Hub for your bed assignment and included amenities.';
  }

  return `I can help with rent (${formatMoney(ctx.rentDuePaise)} due), electricity (${formatMoney(ctx.electricityDuePaise)} due), deposit (${formatMoney(ctx.depositBalancePaise)} refundable), and vacating status. Tap a suggested question or ask in your own words.`;
}
