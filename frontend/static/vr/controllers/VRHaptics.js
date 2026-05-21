export function pulse(controller, {intensity = 0.35, duration = 35} = {}) {
    const gamepad = controller?.userData?.inputSource?.gamepad || controller?.userData?.gamepad;
    const actuator = gamepad?.hapticActuators?.[0];
    try {
        actuator?.pulse?.(intensity, duration);
    } catch {
        // Haptics are optional.
    }
}
