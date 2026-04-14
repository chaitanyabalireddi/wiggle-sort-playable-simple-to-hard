import { _decorator, Component, MeshRenderer, Node } from "cc";
const { ccclass, property } = _decorator;

@ccclass("Belt")
export class Belt extends Component {
	@property(MeshRenderer)
	meshRenderer: MeshRenderer = null!;

	tilingOffset;

	start() {
		this.tilingOffset =
			this.meshRenderer.material.getProperty("tilingOffset");
	}

	update(deltaTime: number) {
		this.tilingOffset.z -= 0.016;
		this.meshRenderer.material.setProperty(
			"tilingOffset",
			this.tilingOffset,
		);
	}
}
