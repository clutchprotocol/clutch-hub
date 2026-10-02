import { IS_TESTNET } from '../config';

/** The yellow "Test network" tag. It shows on testnet hosts only, on every screen that has a header. */
const EnvTag = () => (IS_TESTNET ? <span className="env-tag">Test network</span> : null);

export default EnvTag;
