const INTERVENTION_COST = {
  PAYMENT_RETRY: 5,
  SUBSCRIPTION_RETRY: 5,
  PAYMENT_LINK: 15,
  REMINDER: 2,
  HUMAN_ESCALATION: 150,
  STOP: 0,
};

export function recoveryEconomicsJs(amount, recoveryProbability, action) {
  const cost = INTERVENTION_COST[action] ?? 0;
  const expectedRecovery = Math.round(amount * recoveryProbability * 100) / 100;
  const expectedNetRecovery = Math.round((expectedRecovery - cost) * 100) / 100;
  return {
    amount_at_risk: Math.round(amount * 100) / 100,
    recovery_probability: recoveryProbability,
    expected_recovery: expectedRecovery,
    action_cost: cost,
    action_cost_basis: "MODELED_ASSUMPTION - illustrative flat cost per intervention type, not measured operational cost",
    expected_net_recovery: expectedNetRecovery,
  };
}
