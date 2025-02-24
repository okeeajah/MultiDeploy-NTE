// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

contract Greeter {
    string public name;
    address public owner;

    event NameChanged(string oldName, string newName);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can perform this action");
        _;
    }
    
    constructor(string memory _initialName) {
        name = _initialName;
        owner = msg.sender;
    }


    function changeName(string memory _newName) external onlyOwner {
        string memory oldName = name;
        name = _newName;
        emit NameChanged(oldName, _newName);
    }


    function greet() external view returns (string memory) {
        return string(abi.encodePacked("Hello, ", name, "!"));
    }
}
